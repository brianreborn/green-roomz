/*
 * sm11_monitor.cu — 8600 GT (sm_1.1) security-monitor hot-path assist.
 * CUDA 6.5 / compute_11: private-slot copy (F3/F21), FNV-1a, seq {hi,lo},
 * batch envelope hash, ring scrub, device cmp. GPU MUST NOT list.
 * Host may own the ring. Build: native/sm11-monitor/build.bat
 *
 * Modes: one-shot CLI; --loops N (in-process stress); --serve (stdin cmds).
 */
#include <cuda_runtime.h>
#include <cstdio>
#include <cstdint>
#include <cstring>
#include <cstdlib>
#include <vector>
#include <ctime>

#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#endif

#ifndef SM11_MAX_BYTES
#define SM11_MAX_BYTES 4096
#endif

#ifndef SM11_DEFAULT_ENV_BYTES
#define SM11_DEFAULT_ENV_BYTES 256
#endif

#ifndef SM11_DEFAULT_BATCH
#define SM11_DEFAULT_BATCH 64
#endif

#ifndef SM11_SERVE_LINE
#define SM11_SERVE_LINE 4096
#endif

#ifndef SM11_MAX_TOKS
#define SM11_MAX_TOKS 64
#endif

/* Logical 64-bit seq as two u32s (matches src/monitor/ids.mjs u64 / u64Inc). */
struct Seq64 {
  unsigned hi;
  unsigned lo;
};

__host__ __device__ inline void seq64_inc(Seq64 *s) {
  unsigned lo = s->lo + 1u;
  unsigned hi = s->hi;
  if (lo == 0u) hi = hi + 1u;
  s->lo = lo;
  s->hi = hi;
}

__host__ __device__ inline int seq64_eq(Seq64 a, Seq64 b) {
  return a.hi == b.hi && a.lo == b.lo;
}

__device__ unsigned long long fnv1a64_dev(const unsigned char *data, unsigned n) {
  unsigned long long h = 14695981039346656037ULL;
  for (unsigned i = 0; i < n; i++) {
    h ^= (unsigned long long)data[i];
    h *= 1099511628211ULL;
  }
  return h;
}

__global__ void k_fnv1a(const unsigned char *data, unsigned n, unsigned long long *out) {
  if (threadIdx.x == 0 && blockIdx.x == 0) {
    *out = fnv1a64_dev(data, n);
  }
}

/* One hash per envelope; thread i owns envelope i (no atomics). */
__global__ void k_fnv1a_batch(const unsigned char *envs, unsigned env_bytes,
                              unsigned n, unsigned long long *out) {
  unsigned i = blockIdx.x * blockDim.x + threadIdx.x;
  if (i < n) {
    out[i] = fnv1a64_dev(envs + (size_t)i * env_bytes, env_bytes);
  }
}

__global__ void k_copy(const unsigned char *src, unsigned char *dst, unsigned n) {
  unsigned i = blockIdx.x * blockDim.x + threadIdx.x;
  if (i < n) dst[i] = src[i];
}

/* Device-side mismatch count — avoids full D2H for copy verify (F3 private slot). */
__global__ void k_cmp(const unsigned char *a, const unsigned char *b, unsigned n,
                      unsigned *mismatches) {
  unsigned i = blockIdx.x * blockDim.x + threadIdx.x;
  if (i < n && a[i] != b[i]) atomicAdd(mismatches, 1u);
}

__global__ void k_scrub_zero(unsigned char *buf, unsigned n) {
  unsigned i = blockIdx.x * blockDim.x + threadIdx.x;
  if (i < n) buf[i] = 0;
}

__global__ void k_scrub_xor(unsigned char *buf, unsigned n, unsigned char pattern) {
  unsigned i = blockIdx.x * blockDim.x + threadIdx.x;
  if (i < n) buf[i] ^= pattern;
}

/*
 * Stamp n consecutive seq values starting at *seq into out[0..n), then advance
 * *seq by n. Single-thread kernel — sm_1.1 has no useful 64-bit atomics.
 */
__global__ void k_seq_stamp(Seq64 *seq, Seq64 *out, unsigned n) {
  if (threadIdx.x != 0 || blockIdx.x != 0) return;
  Seq64 cur = *seq;
  for (unsigned i = 0; i < n; i++) {
    out[i] = cur;
    seq64_inc(&cur);
  }
  *seq = cur;
}

static int check(cudaError_t e, const char *what) {
  if (e == cudaSuccess) return 0;
  std::fprintf(stderr, "cuda %s: %s\n", what, cudaGetErrorString(e));
  return 1;
}

static unsigned long long fnv1a64_host(const unsigned char *data, unsigned n) {
  unsigned long long h = 14695981039346656037ULL;
  for (unsigned i = 0; i < n; i++) {
    h ^= (unsigned long long)data[i];
    h *= 1099511628211ULL;
  }
  return h;
}

static unsigned blocks_for(unsigned n, unsigned threads) {
  if (n == 0) return 1;
  return (n + threads - 1) / threads;
}

static double wall_ms_now(void) {
#ifdef _WIN32
  static LARGE_INTEGER freq;
  static int init = 0;
  LARGE_INTEGER c;
  if (!init) {
    QueryPerformanceFrequency(&freq);
    init = 1;
  }
  QueryPerformanceCounter(&c);
  return (double)c.QuadPart * 1000.0 / (double)freq.QuadPart;
#else
  return (double)std::clock() * 1000.0 / (double)CLOCKS_PER_SEC;
#endif
}

struct Options {
  int json;
  int do_copy;
  int do_hash;
  int do_scrub;
  int do_seq;
  int any_flag;
  int serve;
  unsigned batch;
  unsigned env_bytes;
  unsigned loops;
  const char *payload;
};

struct ProbeResult {
  int ok_copy;
  int ok_cmp;
  int ok_hash;
  int ok_batch;
  int ok_scrub;
  int ok_seq;
  unsigned long long h_hash;
  unsigned long long expect_hash;
  Seq64 seq_start;
  Seq64 seq_end;
  unsigned scrub_bytes;
  unsigned cmp_mismatches;
  double ms;
  int cuda_err;
};

static void usage(const char *argv0) {
  std::fprintf(stderr,
    "usage: %s [--json] [--copy] [--hash] [--scrub] [--seq]\n"
    "          [--batch N] [--env-bytes B] [--loops N] [--serve] [payload]\n"
    "  default: all probes (copy+hash+scrub+seq)\n"
    "  --loops N  repeat probes in-process (reports ms_*); N>=1\n"
    "  --serve    stdin lines of CLI args; one JSON reply per line; 'quit' ends\n"
    "  GPU private-slot assist only; does not list models\n",
    argv0 ? argv0 : "sm11_monitor");
}

static int parse_u(const char *s, unsigned *out) {
  if (!s || !*s) return 1;
  char *end = NULL;
  unsigned long v = std::strtoul(s, &end, 10);
  if (end == s || *end != '\0' || v > 0xffffffffUL) return 1;
  *out = (unsigned)v;
  return 0;
}

static void options_defaults(Options *opt) {
  opt->json = 0;
  opt->do_copy = 0;
  opt->do_hash = 0;
  opt->do_scrub = 0;
  opt->do_seq = 0;
  opt->any_flag = 0;
  opt->serve = 0;
  opt->batch = SM11_DEFAULT_BATCH;
  opt->env_bytes = SM11_DEFAULT_ENV_BYTES;
  opt->loops = 1;
  opt->payload = "green-roomz-mailbox-probe";
}

static int parse_args(int argc, char **argv, Options *opt) {
  options_defaults(opt);

  for (int i = 1; i < argc; i++) {
    const char *a = argv[i];
    if (std::strcmp(a, "--help") == 0 || std::strcmp(a, "-h") == 0) {
      usage(argv[0]);
      return -1;
    }
    if (std::strcmp(a, "--json") == 0) {
      opt->json = 1;
      continue;
    }
    if (std::strcmp(a, "--serve") == 0) {
      opt->serve = 1;
      opt->json = 1;
      continue;
    }
    if (std::strcmp(a, "--copy") == 0) {
      opt->do_copy = 1;
      opt->any_flag = 1;
      continue;
    }
    if (std::strcmp(a, "--hash") == 0) {
      opt->do_hash = 1;
      opt->any_flag = 1;
      continue;
    }
    if (std::strcmp(a, "--scrub") == 0) {
      opt->do_scrub = 1;
      opt->any_flag = 1;
      continue;
    }
    if (std::strcmp(a, "--seq") == 0) {
      opt->do_seq = 1;
      opt->any_flag = 1;
      continue;
    }
    if (std::strcmp(a, "--batch") == 0) {
      if (i + 1 >= argc || parse_u(argv[++i], &opt->batch)) {
        std::fprintf(stderr, "bad --batch\n");
        return 1;
      }
      continue;
    }
    if (std::strcmp(a, "--env-bytes") == 0) {
      if (i + 1 >= argc || parse_u(argv[++i], &opt->env_bytes)) {
        std::fprintf(stderr, "bad --env-bytes\n");
        return 1;
      }
      continue;
    }
    if (std::strcmp(a, "--loops") == 0) {
      if (i + 1 >= argc || parse_u(argv[++i], &opt->loops) || opt->loops < 1u) {
        std::fprintf(stderr, "bad --loops\n");
        return 1;
      }
      continue;
    }
    if (a[0] == '-') {
      std::fprintf(stderr, "unknown flag %s\n", a);
      usage(argv[0]);
      return 1;
    }
    opt->payload = a;
  }

  if (!opt->any_flag) {
    opt->do_copy = 1;
    opt->do_hash = 1;
    opt->do_scrub = 1;
    opt->do_seq = 1;
  }
  return 0;
}

static int validate_options(const Options *opt) {
  if (opt->batch == 0 || opt->batch > 4096) {
    std::fprintf(stderr, "batch %u out of range (1..4096)\n", opt->batch);
    return 5;
  }
  if (opt->env_bytes == 0 || opt->env_bytes > SM11_MAX_BYTES) {
    std::fprintf(stderr, "env-bytes %u out of range\n", opt->env_bytes);
    return 5;
  }
  const size_t batch_bytes = (size_t)opt->batch * (size_t)opt->env_bytes;
  if (batch_bytes > 32u * 1024u * 1024u) {
    std::fprintf(stderr, "batch*env-bytes too large for 8600 probe\n");
    return 5;
  }
  unsigned n_payload = (unsigned)std::strlen(opt->payload);
  if (n_payload == 0 || n_payload > SM11_MAX_BYTES) {
    std::fprintf(stderr, "payload length %u out of range\n", n_payload);
    return 5;
  }
  return 0;
}

static void print_text_device(const cudaDeviceProp &prop) {
  std::printf("device0=%s sm_%d%d vram_mb=%u\n",
              prop.name, prop.major, prop.minor,
              (unsigned)(prop.totalGlobalMem / (1024 * 1024)));
}

static void result_clear(ProbeResult *r) {
  r->ok_copy = 1;
  r->ok_cmp = 1;
  r->ok_hash = 1;
  r->ok_batch = 1;
  r->ok_scrub = 1;
  r->ok_seq = 1;
  r->h_hash = 0;
  r->expect_hash = 0;
  r->seq_start.hi = 0;
  r->seq_start.lo = 0xfffffffeu;
  r->seq_end.hi = 0;
  r->seq_end.lo = 0;
  r->scrub_bytes = 0;
  r->cmp_mismatches = 0;
  r->ms = 0;
  r->cuda_err = 0;
}

/* Run selected probes once. Returns 0 on CUDA API success (ok_* may still fail). */
static int run_probes_once(const Options *opt, ProbeResult *r) {
  result_clear(r);
  const double t0 = wall_ms_now();
  const unsigned threads = 128;
  unsigned n_payload = (unsigned)std::strlen(opt->payload);
  const size_t batch_bytes = (size_t)opt->batch * (size_t)opt->env_bytes;
  r->scrub_bytes = opt->env_bytes * (opt->batch < 16u ? opt->batch : 16u);
  r->seq_start.hi = 0u;
  r->seq_start.lo = 0xfffffffeu;

  if (opt->do_copy || opt->do_hash) {
    std::vector<unsigned char> host(opt->payload, opt->payload + n_payload);
    unsigned char *d_src = NULL;
    unsigned char *d_dst = NULL;
    unsigned long long *d_hash = NULL;
    unsigned *d_mis = NULL;

    if (check(cudaMalloc((void **)&d_src, n_payload), "Malloc src")) { r->cuda_err = 1; return 2; }
    if (check(cudaMalloc((void **)&d_dst, n_payload), "Malloc dst")) { r->cuda_err = 1; return 2; }
    if (opt->do_hash) {
      if (check(cudaMalloc((void **)&d_hash, sizeof(unsigned long long)), "Malloc hash")) {
        r->cuda_err = 1; return 2;
      }
    }
    if (opt->do_copy) {
      if (check(cudaMalloc((void **)&d_mis, sizeof(unsigned)), "Malloc cmp")) {
        r->cuda_err = 1; return 2;
      }
    }
    if (check(cudaMemcpy(d_src, host.data(), n_payload, cudaMemcpyHostToDevice), "H2D")) {
      r->cuda_err = 1; return 2;
    }

    if (opt->do_copy) {
      k_copy<<<blocks_for(n_payload, threads), threads>>>(d_src, d_dst, n_payload);
      if (check(cudaDeviceSynchronize(), "sync copy")) { r->cuda_err = 1; return 2; }

      /* Host memcmp path (existing contract). */
      std::vector<unsigned char> back(n_payload);
      if (check(cudaMemcpy(back.data(), d_dst, n_payload, cudaMemcpyDeviceToHost), "D2H copy")) {
        r->cuda_err = 1; return 2;
      }
      r->ok_copy = (std::memcmp(host.data(), back.data(), n_payload) == 0) ? 1 : 0;

      /* Device cmp path (private-slot verify without trusting only D2H). */
      unsigned zero = 0;
      if (check(cudaMemcpy(d_mis, &zero, sizeof(zero), cudaMemcpyHostToDevice), "H2D cmp0")) {
        r->cuda_err = 1; return 2;
      }
      k_cmp<<<blocks_for(n_payload, threads), threads>>>(d_src, d_dst, n_payload, d_mis);
      if (check(cudaDeviceSynchronize(), "sync cmp")) { r->cuda_err = 1; return 2; }
      if (check(cudaMemcpy(&r->cmp_mismatches, d_mis, sizeof(unsigned), cudaMemcpyDeviceToHost),
                "D2H cmp")) {
        r->cuda_err = 1; return 2;
      }
      r->ok_cmp = (r->cmp_mismatches == 0u) ? 1 : 0;
      if (!r->ok_cmp) r->ok_copy = 0;
    }

    if (opt->do_hash) {
      const unsigned char *hash_src = opt->do_copy ? d_dst : d_src;
      k_fnv1a<<<1, 1>>>(hash_src, n_payload, d_hash);
      if (check(cudaDeviceSynchronize(), "sync hash")) { r->cuda_err = 1; return 2; }
      if (check(cudaMemcpy(&r->h_hash, d_hash, sizeof(r->h_hash), cudaMemcpyDeviceToHost), "D2H hash")) {
        r->cuda_err = 1; return 2;
      }
      r->expect_hash = fnv1a64_host(host.data(), n_payload);
      r->ok_hash = (r->h_hash == r->expect_hash) ? 1 : 0;
    }

    cudaFree(d_src);
    cudaFree(d_dst);
    if (d_hash) cudaFree(d_hash);
    if (d_mis) cudaFree(d_mis);
  }

  if (opt->do_hash) {
    std::vector<unsigned char> envs(batch_bytes);
    for (unsigned i = 0; i < opt->batch; i++) {
      unsigned char *e = &envs[(size_t)i * opt->env_bytes];
      std::memset(e, (int)(0xA5 ^ (i & 0xff)), opt->env_bytes);
      e[0] = (unsigned char)(i & 0xff);
      e[1] = (unsigned char)((i >> 8) & 0xff);
    }

    unsigned char *d_envs = NULL;
    unsigned long long *d_hashes = NULL;
    std::vector<unsigned long long> h_hashes(opt->batch);

    if (check(cudaMalloc((void **)&d_envs, batch_bytes), "Malloc envs")) { r->cuda_err = 1; return 2; }
    if (check(cudaMalloc((void **)&d_hashes, opt->batch * sizeof(unsigned long long)), "Malloc hashes")) {
      r->cuda_err = 1; return 2;
    }
    if (check(cudaMemcpy(d_envs, envs.data(), batch_bytes, cudaMemcpyHostToDevice), "H2D envs")) {
      r->cuda_err = 1; return 2;
    }

    k_fnv1a_batch<<<blocks_for(opt->batch, threads), threads>>>(
        d_envs, opt->env_bytes, opt->batch, d_hashes);
    if (check(cudaDeviceSynchronize(), "sync batch hash")) { r->cuda_err = 1; return 2; }
    if (check(cudaMemcpy(h_hashes.data(), d_hashes, opt->batch * sizeof(unsigned long long),
                         cudaMemcpyDeviceToHost), "D2H hashes")) {
      r->cuda_err = 1; return 2;
    }

    r->ok_batch = 1;
    for (unsigned i = 0; i < opt->batch; i++) {
      unsigned long long exp = fnv1a64_host(&envs[(size_t)i * opt->env_bytes], opt->env_bytes);
      if (h_hashes[i] != exp) {
        r->ok_batch = 0;
        break;
      }
    }
    if (!r->ok_batch) r->ok_hash = 0;

    cudaFree(d_envs);
    cudaFree(d_hashes);
  }

  if (opt->do_scrub) {
    std::vector<unsigned char> host(r->scrub_bytes);
    for (unsigned i = 0; i < r->scrub_bytes; i++) host[i] = (unsigned char)(0x5A ^ (i & 0xff));

    unsigned char *d_ring = NULL;
    if (check(cudaMalloc((void **)&d_ring, r->scrub_bytes), "Malloc scrub")) { r->cuda_err = 1; return 2; }
    if (check(cudaMemcpy(d_ring, host.data(), r->scrub_bytes, cudaMemcpyHostToDevice), "H2D scrub")) {
      r->cuda_err = 1; return 2;
    }

    k_scrub_zero<<<blocks_for(r->scrub_bytes, threads), threads>>>(d_ring, r->scrub_bytes);
    if (check(cudaDeviceSynchronize(), "sync scrub zero")) { r->cuda_err = 1; return 2; }
    std::vector<unsigned char> after_zero(r->scrub_bytes);
    if (check(cudaMemcpy(after_zero.data(), d_ring, r->scrub_bytes, cudaMemcpyDeviceToHost), "D2H scrub0")) {
      r->cuda_err = 1; return 2;
    }
    int zero_ok = 1;
    for (unsigned i = 0; i < r->scrub_bytes; i++) {
      if (after_zero[i] != 0) { zero_ok = 0; break; }
    }

    const unsigned char xor_pat = 0xA5;
    if (check(cudaMemcpy(d_ring, host.data(), r->scrub_bytes, cudaMemcpyHostToDevice), "H2D scrub2")) {
      r->cuda_err = 1; return 2;
    }
    k_scrub_xor<<<blocks_for(r->scrub_bytes, threads), threads>>>(d_ring, r->scrub_bytes, xor_pat);
    if (check(cudaDeviceSynchronize(), "sync scrub xor")) { r->cuda_err = 1; return 2; }
    std::vector<unsigned char> after_xor(r->scrub_bytes);
    if (check(cudaMemcpy(after_xor.data(), d_ring, r->scrub_bytes, cudaMemcpyDeviceToHost), "D2H scrubx")) {
      r->cuda_err = 1; return 2;
    }
    int xor_ok = 1;
    for (unsigned i = 0; i < r->scrub_bytes; i++) {
      unsigned char expect = (unsigned char)(host[i] ^ xor_pat);
      if (after_xor[i] != expect) { xor_ok = 0; break; }
    }

    r->ok_scrub = (zero_ok && xor_ok) ? 1 : 0;
    cudaFree(d_ring);
  }

  if (opt->do_seq) {
    unsigned stamp_n = opt->batch < 8u ? opt->batch : 8u;
    if (stamp_n < 4u) stamp_n = 4u;

    Seq64 *d_seq = NULL;
    Seq64 *d_out = NULL;
    std::vector<Seq64> h_out(stamp_n);
    Seq64 h_seq = r->seq_start;

    if (check(cudaMalloc((void **)&d_seq, sizeof(Seq64)), "Malloc seq")) { r->cuda_err = 1; return 2; }
    if (check(cudaMalloc((void **)&d_out, stamp_n * sizeof(Seq64)), "Malloc seq out")) {
      r->cuda_err = 1; return 2;
    }
    if (check(cudaMemcpy(d_seq, &h_seq, sizeof(Seq64), cudaMemcpyHostToDevice), "H2D seq")) {
      r->cuda_err = 1; return 2;
    }

    k_seq_stamp<<<1, 1>>>(d_seq, d_out, stamp_n);
    if (check(cudaDeviceSynchronize(), "sync seq")) { r->cuda_err = 1; return 2; }
    if (check(cudaMemcpy(h_out.data(), d_out, stamp_n * sizeof(Seq64), cudaMemcpyDeviceToHost),
              "D2H seq out")) {
      r->cuda_err = 1; return 2;
    }
    if (check(cudaMemcpy(&r->seq_end, d_seq, sizeof(Seq64), cudaMemcpyDeviceToHost), "D2H seq")) {
      r->cuda_err = 1; return 2;
    }

    r->ok_seq = 1;
    Seq64 expect = r->seq_start;
    for (unsigned i = 0; i < stamp_n; i++) {
      if (!seq64_eq(h_out[i], expect)) { r->ok_seq = 0; break; }
      seq64_inc(&expect);
    }
    if (r->ok_seq && !seq64_eq(r->seq_end, expect)) r->ok_seq = 0;
    if (r->ok_seq && stamp_n >= 3) {
      if (h_out[0].hi != 0u || h_out[0].lo != 0xfffffffeu) r->ok_seq = 0;
      if (h_out[1].hi != 0u || h_out[1].lo != 0xffffffffu) r->ok_seq = 0;
      if (h_out[2].hi != 1u || h_out[2].lo != 0u) r->ok_seq = 0;
    }

    cudaFree(d_seq);
    cudaFree(d_out);
  }

  r->ms = wall_ms_now() - t0;
  return 0;
}

static int result_all_ok(const Options *opt, const ProbeResult *r) {
  if (r->cuda_err) return 0;
  if (opt->do_copy && !r->ok_copy) return 0;
  if (opt->do_hash && !r->ok_hash) return 0;
  if (opt->do_scrub && !r->ok_scrub) return 0;
  if (opt->do_seq && !r->ok_seq) return 0;
  return 1;
}

static void print_json_result(const Options *opt, const cudaDeviceProp &prop,
                              const ProbeResult *r, int all_ok,
                              unsigned loops, unsigned loop_fail,
                              double ms_min, double ms_avg, double ms_max) {
  std::printf("{");
  std::printf("\"device\":\"%s\",\"sm\":\"%d%d\",\"vram_mb\":%u,",
              prop.name, prop.major, prop.minor,
              (unsigned)(prop.totalGlobalMem / (1024 * 1024)));
  std::printf("\"batch\":%u,\"env_bytes\":%u,", opt->batch, opt->env_bytes);
  if (opt->do_copy) {
    std::printf("\"copy_ok\":%s,\"cmp_ok\":%s,\"cmp_mismatches\":%u,",
                r->ok_copy ? "true" : "false",
                r->ok_cmp ? "true" : "false",
                r->cmp_mismatches);
  }
  if (opt->do_hash) {
    std::printf("\"hash_ok\":%s,\"hash\":\"0x%016llx\",\"expect\":\"0x%016llx\",\"batch_ok\":%s,",
                r->ok_hash ? "true" : "false",
                (unsigned long long)r->h_hash, (unsigned long long)r->expect_hash,
                r->ok_batch ? "true" : "false");
  }
  if (opt->do_scrub) {
    std::printf("\"scrub_ok\":%s,\"scrub_bytes\":%u,",
                r->ok_scrub ? "true" : "false", r->scrub_bytes);
  }
  if (opt->do_seq) {
    std::printf("\"seq_ok\":%s,\"seq_start\":{\"hi\":%u,\"lo\":%u},\"seq_end\":{\"hi\":%u,\"lo\":%u},",
                r->ok_seq ? "true" : "false",
                r->seq_start.hi, r->seq_start.lo, r->seq_end.hi, r->seq_end.lo);
  }
  std::printf("\"ms\":%.3f,", r->ms);
  if (loops > 1u) {
    std::printf("\"loops\":%u,\"loop_fail\":%u,\"ms_min\":%.3f,\"ms_avg\":%.3f,\"ms_max\":%.3f,",
                loops, loop_fail, ms_min, ms_avg, ms_max);
  }
  std::printf("\"ok\":%s}\n", all_ok ? "true" : "false");
  std::fflush(stdout);
}

static void print_text_result(const Options *opt, const ProbeResult *r) {
  if (opt->do_copy || opt->do_hash) {
    std::printf("copy_ok=%d cmp_ok=%d", opt->do_copy ? r->ok_copy : -1,
                opt->do_copy ? r->ok_cmp : -1);
    if (opt->do_hash) {
      std::printf(" hash_ok=%d hash=0x%016llx expect=0x%016llx batch_ok=%d",
                  r->ok_hash,
                  (unsigned long long)r->h_hash, (unsigned long long)r->expect_hash, r->ok_batch);
    }
    std::printf("\n");
  }
  if (opt->do_scrub) {
    std::printf("scrub_ok=%d scrub_bytes=%u\n", r->ok_scrub, r->scrub_bytes);
  }
  if (opt->do_seq) {
    std::printf("seq_ok=%d seq_start=%u:%u seq_end=%u:%u\n",
                r->ok_seq, r->seq_start.hi, r->seq_start.lo, r->seq_end.hi, r->seq_end.lo);
  }
  std::printf("ms=%.3f\n", r->ms);
}

static int run_with_loops(const Options *opt, const cudaDeviceProp &prop) {
  ProbeResult last;
  result_clear(&last);
  unsigned fail = 0;
  double ms_min = 1e300;
  double ms_max = 0;
  double ms_sum = 0;

  for (unsigned i = 0; i < opt->loops; i++) {
    ProbeResult r;
    int rc = run_probes_once(opt, &r);
    if (rc != 0 || !result_all_ok(opt, &r)) fail++;
    if (r.ms < ms_min) ms_min = r.ms;
    if (r.ms > ms_max) ms_max = r.ms;
    ms_sum += r.ms;
    last = r;
    if (rc != 0) break;
  }

  const double ms_avg = opt->loops ? (ms_sum / (double)opt->loops) : 0;
  const int all_ok = (fail == 0) ? 1 : 0;

  if (opt->json) {
    print_json_result(opt, prop, &last, all_ok, opt->loops, fail, ms_min, ms_avg, ms_max);
  } else {
    print_text_result(opt, &last);
    if (opt->loops > 1u) {
      std::printf("loops=%u loop_fail=%u ms_min=%.3f ms_avg=%.3f ms_max=%.3f\n",
                  opt->loops, fail, ms_min, ms_avg, ms_max);
    }
  }
  return all_ok ? 0 : 1;
}

/* Tokenize a serve line into argv-style pointers (mutates line). */
static int tokenize_line(char *line, char **toks, int max_toks) {
  int n = 0;
  char *p = line;
  while (*p && n < max_toks) {
    while (*p == ' ' || *p == '\t' || *p == '\r' || *p == '\n') p++;
    if (!*p) break;
    toks[n++] = p;
    while (*p && *p != ' ' && *p != '\t' && *p != '\r' && *p != '\n') p++;
    if (*p) { *p = '\0'; p++; }
  }
  return n;
}

static int run_serve(const cudaDeviceProp &prop) {
  char line[SM11_SERVE_LINE];
  char *toks[SM11_MAX_TOKS];
  /* Synthetic argv[0] for parse_args. */
  char prog[] = "sm11_monitor";

  std::fprintf(stderr, "sm11_monitor serve ready sm_%d%d\n", prop.major, prop.minor);
  std::fflush(stderr);

  while (std::fgets(line, (int)sizeof(line), stdin)) {
    /* Strip comments / blank */
    char *hash = std::strchr(line, '#');
    if (hash) *hash = '\0';

    int nt = tokenize_line(line, toks, SM11_MAX_TOKS);
    if (nt == 0) continue;
    if (std::strcmp(toks[0], "quit") == 0 || std::strcmp(toks[0], "exit") == 0) {
      std::printf("{\"ok\":true,\"bye\":true}\n");
      std::fflush(stdout);
      return 0;
    }

    char *argv_buf[SM11_MAX_TOKS + 1];
    argv_buf[0] = prog;
    for (int i = 0; i < nt; i++) argv_buf[i + 1] = toks[i];
    int argc = nt + 1;

    Options opt;
    int pa = parse_args(argc, argv_buf, &opt);
    if (pa < 0) {
      std::printf("{\"ok\":false,\"error\":\"help\"}\n");
      std::fflush(stdout);
      continue;
    }
    if (pa > 0) {
      std::printf("{\"ok\":false,\"error\":\"bad_args\"}\n");
      std::fflush(stdout);
      continue;
    }
    opt.json = 1;
    opt.serve = 0;
    if (validate_options(&opt) != 0) {
      std::printf("{\"ok\":false,\"error\":\"bad_options\"}\n");
      std::fflush(stdout);
      continue;
    }

    /* One reply per command; loops still allowed inside a serve line. */
    (void)run_with_loops(&opt, prop);
  }
  return 0;
}

int main(int argc, char **argv) {
  Options opt;
  int pa = parse_args(argc, argv, &opt);
  if (pa < 0) return 0;
  if (pa > 0) return 5;

  int device_count = 0;
  if (check(cudaGetDeviceCount(&device_count), "GetDeviceCount")) return 2;
  if (device_count < 1) {
    std::fprintf(stderr, "no CUDA devices\n");
    return 3;
  }

  cudaDeviceProp prop;
  if (check(cudaGetDeviceProperties(&prop, 0), "GetDeviceProperties")) return 2;

  if (prop.major < 1 || (prop.major == 1 && prop.minor < 1)) {
    std::fprintf(stderr, "need sm_1.1+\n");
    return 4;
  }

  if (opt.serve) {
    return run_serve(prop);
  }

  if (!opt.json) print_text_device(prop);

  int vo = validate_options(&opt);
  if (vo != 0) return vo;

  return run_with_loops(&opt, prop);
}
