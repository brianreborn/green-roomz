/*
 * sm11_monitor.cu — 8600 GT (sm_1.1) security-monitor hot-path assist.
 * CUDA 6.5 / compute_11: private-slot copy (F3/F21), FNV-1a, seq {hi,lo},
 * batch envelope hash, ring scrub. GPU MUST NOT list; host may own the ring.
 * Build: native/sm11-monitor/build.bat
 */
#include <cuda_runtime.h>
#include <cstdio>
#include <cstdint>
#include <cstring>
#include <cstdlib>
#include <vector>

#ifndef SM11_MAX_BYTES
#define SM11_MAX_BYTES 4096
#endif

#ifndef SM11_DEFAULT_ENV_BYTES
#define SM11_DEFAULT_ENV_BYTES 256
#endif

#ifndef SM11_DEFAULT_BATCH
#define SM11_DEFAULT_BATCH 64
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

struct Options {
  int json;
  int do_copy;
  int do_hash;
  int do_scrub;
  int do_seq;
  int any_flag;
  unsigned batch;
  unsigned env_bytes;
  const char *payload;
};

static void usage(const char *argv0) {
  std::fprintf(stderr,
    "usage: %s [--json] [--copy] [--hash] [--scrub] [--seq]\n"
    "          [--batch N] [--env-bytes B] [payload]\n"
    "  default: all probes (copy+hash+scrub+seq)\n"
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

static int parse_args(int argc, char **argv, Options *opt) {
  opt->json = 0;
  opt->do_copy = 0;
  opt->do_hash = 0;
  opt->do_scrub = 0;
  opt->do_seq = 0;
  opt->any_flag = 0;
  opt->batch = SM11_DEFAULT_BATCH;
  opt->env_bytes = SM11_DEFAULT_ENV_BYTES;
  opt->payload = "green-roomz-mailbox-probe";

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

static void print_text_device(const cudaDeviceProp &prop) {
  std::printf("device0=%s sm_%d%d vram_mb=%u\n",
              prop.name, prop.major, prop.minor,
              (unsigned)(prop.totalGlobalMem / (1024 * 1024)));
}

int main(int argc, char **argv) {
  Options opt;
  int pa = parse_args(argc, argv, &opt);
  if (pa < 0) return 0;
  if (pa > 0) return 5;

  if (opt.batch == 0 || opt.batch > 4096) {
    std::fprintf(stderr, "batch %u out of range (1..4096)\n", opt.batch);
    return 5;
  }
  if (opt.env_bytes == 0 || opt.env_bytes > SM11_MAX_BYTES) {
    std::fprintf(stderr, "env-bytes %u out of range\n", opt.env_bytes);
    return 5;
  }

  /* Keep probe footprint well under 224 MiB VRAM. */
  const size_t batch_bytes = (size_t)opt.batch * (size_t)opt.env_bytes;
  if (batch_bytes > 32u * 1024u * 1024u) {
    std::fprintf(stderr, "batch*env-bytes too large for 8600 probe\n");
    return 5;
  }

  int device_count = 0;
  if (check(cudaGetDeviceCount(&device_count), "GetDeviceCount")) return 2;
  if (device_count < 1) {
    std::fprintf(stderr, "no CUDA devices\n");
    return 3;
  }

  cudaDeviceProp prop;
  if (check(cudaGetDeviceProperties(&prop, 0), "GetDeviceProperties")) return 2;
  if (!opt.json) print_text_device(prop);

  if (prop.major < 1 || (prop.major == 1 && prop.minor < 1)) {
    std::fprintf(stderr, "need sm_1.1+\n");
    return 4;
  }

  unsigned n_payload = (unsigned)std::strlen(opt.payload);
  if (n_payload == 0 || n_payload > SM11_MAX_BYTES) {
    std::fprintf(stderr, "payload length %u out of range\n", n_payload);
    return 5;
  }

  int ok_copy = 1;
  int ok_hash = 1;
  int ok_batch = 1;
  int ok_scrub = 1;
  int ok_seq = 1;
  unsigned long long h_hash = 0;
  unsigned long long expect_hash = 0;
  Seq64 seq_start = {0u, 0xfffffffeu};
  Seq64 seq_end = {0u, 0u};
  unsigned scrub_bytes = opt.env_bytes * (opt.batch < 16u ? opt.batch : 16u);

  const unsigned threads = 128;

  /* --- copy + single FNV (private slot path) --- */
  if (opt.do_copy || opt.do_hash) {
    std::vector<unsigned char> host(opt.payload, opt.payload + n_payload);
    unsigned char *d_src = NULL;
    unsigned char *d_dst = NULL;
    unsigned long long *d_hash = NULL;

    if (check(cudaMalloc((void **)&d_src, n_payload), "Malloc src")) return 2;
    if (check(cudaMalloc((void **)&d_dst, n_payload), "Malloc dst")) return 2;
    if (opt.do_hash) {
      if (check(cudaMalloc((void **)&d_hash, sizeof(unsigned long long)), "Malloc hash")) return 2;
    }
    if (check(cudaMemcpy(d_src, host.data(), n_payload, cudaMemcpyHostToDevice), "H2D")) return 2;

    if (opt.do_copy) {
      k_copy<<<blocks_for(n_payload, threads), threads>>>(d_src, d_dst, n_payload);
      if (check(cudaDeviceSynchronize(), "sync copy")) return 2;
      std::vector<unsigned char> back(n_payload);
      if (check(cudaMemcpy(back.data(), d_dst, n_payload, cudaMemcpyDeviceToHost), "D2H copy")) return 2;
      ok_copy = (std::memcmp(host.data(), back.data(), n_payload) == 0) ? 1 : 0;
    }

    if (opt.do_hash) {
      const unsigned char *hash_src = opt.do_copy ? d_dst : d_src;
      k_fnv1a<<<1, 1>>>(hash_src, n_payload, d_hash);
      if (check(cudaDeviceSynchronize(), "sync hash")) return 2;
      if (check(cudaMemcpy(&h_hash, d_hash, sizeof(h_hash), cudaMemcpyDeviceToHost), "D2H hash")) return 2;
      expect_hash = fnv1a64_host(host.data(), n_payload);
      ok_hash = (h_hash == expect_hash) ? 1 : 0;
    }

    cudaFree(d_src);
    cudaFree(d_dst);
    if (d_hash) cudaFree(d_hash);
  }

  /* --- batch envelope FNV --- */
  if (opt.do_hash) {
    std::vector<unsigned char> envs(batch_bytes);
    for (unsigned i = 0; i < opt.batch; i++) {
      unsigned char *e = &envs[(size_t)i * opt.env_bytes];
      std::memset(e, (int)(0xA5 ^ (i & 0xff)), opt.env_bytes);
      e[0] = (unsigned char)(i & 0xff);
      e[1] = (unsigned char)((i >> 8) & 0xff);
    }

    unsigned char *d_envs = NULL;
    unsigned long long *d_hashes = NULL;
    std::vector<unsigned long long> h_hashes(opt.batch);

    if (check(cudaMalloc((void **)&d_envs, batch_bytes), "Malloc envs")) return 2;
    if (check(cudaMalloc((void **)&d_hashes, opt.batch * sizeof(unsigned long long)), "Malloc hashes")) return 2;
    if (check(cudaMemcpy(d_envs, envs.data(), batch_bytes, cudaMemcpyHostToDevice), "H2D envs")) return 2;

    k_fnv1a_batch<<<blocks_for(opt.batch, threads), threads>>>(
        d_envs, opt.env_bytes, opt.batch, d_hashes);
    if (check(cudaDeviceSynchronize(), "sync batch hash")) return 2;
    if (check(cudaMemcpy(h_hashes.data(), d_hashes, opt.batch * sizeof(unsigned long long),
                         cudaMemcpyDeviceToHost), "D2H hashes")) return 2;

    ok_batch = 1;
    for (unsigned i = 0; i < opt.batch; i++) {
      unsigned long long exp = fnv1a64_host(&envs[(size_t)i * opt.env_bytes], opt.env_bytes);
      if (h_hashes[i] != exp) {
        ok_batch = 0;
        break;
      }
    }
    /* Single-payload hash_ok already set; batch failure also fails hash. */
    if (!ok_batch) ok_hash = 0;

    cudaFree(d_envs);
    cudaFree(d_hashes);
  }

  /* --- ring scrub: zero then XOR pattern --- */
  if (opt.do_scrub) {
    std::vector<unsigned char> host(scrub_bytes);
    for (unsigned i = 0; i < scrub_bytes; i++) host[i] = (unsigned char)(0x5A ^ (i & 0xff));

    unsigned char *d_ring = NULL;
    if (check(cudaMalloc((void **)&d_ring, scrub_bytes), "Malloc scrub")) return 2;
    if (check(cudaMemcpy(d_ring, host.data(), scrub_bytes, cudaMemcpyHostToDevice), "H2D scrub")) return 2;

    k_scrub_zero<<<blocks_for(scrub_bytes, threads), threads>>>(d_ring, scrub_bytes);
    if (check(cudaDeviceSynchronize(), "sync scrub zero")) return 2;
    std::vector<unsigned char> after_zero(scrub_bytes);
    if (check(cudaMemcpy(after_zero.data(), d_ring, scrub_bytes, cudaMemcpyDeviceToHost), "D2H scrub0")) return 2;
    int zero_ok = 1;
    for (unsigned i = 0; i < scrub_bytes; i++) {
      if (after_zero[i] != 0) {
        zero_ok = 0;
        break;
      }
    }

    const unsigned char xor_pat = 0xA5;
    if (check(cudaMemcpy(d_ring, host.data(), scrub_bytes, cudaMemcpyHostToDevice), "H2D scrub2")) return 2;
    k_scrub_xor<<<blocks_for(scrub_bytes, threads), threads>>>(d_ring, scrub_bytes, xor_pat);
    if (check(cudaDeviceSynchronize(), "sync scrub xor")) return 2;
    std::vector<unsigned char> after_xor(scrub_bytes);
    if (check(cudaMemcpy(after_xor.data(), d_ring, scrub_bytes, cudaMemcpyDeviceToHost), "D2H scrubx")) return 2;
    int xor_ok = 1;
    for (unsigned i = 0; i < scrub_bytes; i++) {
      unsigned char expect = (unsigned char)(host[i] ^ xor_pat);
      if (after_xor[i] != expect) {
        xor_ok = 0;
        break;
      }
    }

    ok_scrub = (zero_ok && xor_ok) ? 1 : 0;
    cudaFree(d_ring);
  }

  /* --- seq {hi,lo} stamp with wrap across 0xffffffff --- */
  if (opt.do_seq) {
    unsigned stamp_n = opt.batch < 8u ? opt.batch : 8u;
    if (stamp_n < 4u) stamp_n = 4u;

    Seq64 *d_seq = NULL;
    Seq64 *d_out = NULL;
    std::vector<Seq64> h_out(stamp_n);
    Seq64 h_seq = seq_start;

    if (check(cudaMalloc((void **)&d_seq, sizeof(Seq64)), "Malloc seq")) return 2;
    if (check(cudaMalloc((void **)&d_out, stamp_n * sizeof(Seq64)), "Malloc seq out")) return 2;
    if (check(cudaMemcpy(d_seq, &h_seq, sizeof(Seq64), cudaMemcpyHostToDevice), "H2D seq")) return 2;

    k_seq_stamp<<<1, 1>>>(d_seq, d_out, stamp_n);
    if (check(cudaDeviceSynchronize(), "sync seq")) return 2;
    if (check(cudaMemcpy(h_out.data(), d_out, stamp_n * sizeof(Seq64), cudaMemcpyDeviceToHost), "D2H seq out")) return 2;
    if (check(cudaMemcpy(&seq_end, d_seq, sizeof(Seq64), cudaMemcpyDeviceToHost), "D2H seq")) return 2;

    ok_seq = 1;
    Seq64 expect = seq_start;
    for (unsigned i = 0; i < stamp_n; i++) {
      if (!seq64_eq(h_out[i], expect)) {
        ok_seq = 0;
        break;
      }
      seq64_inc(&expect);
    }
    if (ok_seq && !seq64_eq(seq_end, expect)) ok_seq = 0;
    /* Prove wrap: start lo=0xfffffffe => stamps include fffffffe, ffffffff, then hi+1/lo=0. */
    if (ok_seq && stamp_n >= 3) {
      if (h_out[0].hi != 0u || h_out[0].lo != 0xfffffffeu) ok_seq = 0;
      if (h_out[1].hi != 0u || h_out[1].lo != 0xffffffffu) ok_seq = 0;
      if (h_out[2].hi != 1u || h_out[2].lo != 0u) ok_seq = 0;
    }

    cudaFree(d_seq);
    cudaFree(d_out);
  }

  int all_ok = 1;
  if (opt.do_copy && !ok_copy) all_ok = 0;
  if (opt.do_hash && !ok_hash) all_ok = 0;
  if (opt.do_scrub && !ok_scrub) all_ok = 0;
  if (opt.do_seq && !ok_seq) all_ok = 0;

  if (opt.json) {
    std::printf("{");
    std::printf("\"device\":\"%s\",\"sm\":\"%d%d\",\"vram_mb\":%u,",
                prop.name, prop.major, prop.minor,
                (unsigned)(prop.totalGlobalMem / (1024 * 1024)));
    std::printf("\"batch\":%u,\"env_bytes\":%u,", opt.batch, opt.env_bytes);
    if (opt.do_copy) std::printf("\"copy_ok\":%s,", ok_copy ? "true" : "false");
    if (opt.do_hash) {
      std::printf("\"hash_ok\":%s,\"hash\":\"0x%016llx\",\"expect\":\"0x%016llx\",\"batch_ok\":%s,",
                  ok_hash ? "true" : "false",
                  (unsigned long long)h_hash, (unsigned long long)expect_hash,
                  ok_batch ? "true" : "false");
    }
    if (opt.do_scrub) std::printf("\"scrub_ok\":%s,", ok_scrub ? "true" : "false");
    if (opt.do_seq) {
      std::printf("\"seq_ok\":%s,\"seq_start\":{\"hi\":%u,\"lo\":%u},\"seq_end\":{\"hi\":%u,\"lo\":%u},",
                  ok_seq ? "true" : "false",
                  seq_start.hi, seq_start.lo, seq_end.hi, seq_end.lo);
    }
    std::printf("\"ok\":%s}\n", all_ok ? "true" : "false");
  } else {
    if (opt.do_copy || opt.do_hash) {
      std::printf("copy_ok=%d hash_ok=%d", opt.do_copy ? ok_copy : -1, opt.do_hash ? ok_hash : -1);
      if (opt.do_hash) {
        std::printf(" hash=0x%016llx expect=0x%016llx batch_ok=%d",
                    (unsigned long long)h_hash, (unsigned long long)expect_hash, ok_batch);
      }
      std::printf("\n");
    }
    if (opt.do_scrub) {
      std::printf("scrub_ok=%d scrub_bytes=%u\n", ok_scrub, scrub_bytes);
    }
    if (opt.do_seq) {
      std::printf("seq_ok=%d seq_start=%u:%u seq_end=%u:%u\n",
                  ok_seq, seq_start.hi, seq_start.lo, seq_end.hi, seq_end.lo);
    }
  }

  return all_ok ? 0 : 1;
}
