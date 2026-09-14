/*
 * sm11_monitor.cu — 8600 GT (sm_1.1) security-monitor hot-path assist.
 * CUDA 6.5 / compute_11: private-slot copy (F3/F21), FNV-1a, seq {hi,lo},
 * batch envelope hash, ring scrub, device cmp, fixed private-slot ring.
 * GPU MUST NOT list. Host owns 32-bit ring index; GPU assists hash/copy/scrub/cmp.
 * Place/respond/logger are never CUDA launches. Build: native/sm11-monitor/build.bat
 *
 * Modes: one-shot CLI; --loops N (in-process stress); --serve (stdin cmds).
 * Ring persists across --serve commands (device slots stay allocated).
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

#ifndef SM11_DEFAULT_RING_SLOTS
#define SM11_DEFAULT_RING_SLOTS 32
#endif

#ifndef SM11_MIN_RING_SLOTS
#define SM11_MIN_RING_SLOTS 16
#endif

#ifndef SM11_MAX_RING_SLOTS
#define SM11_MAX_RING_SLOTS 64
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

/*
 * Fixed private-slot ring in device memory.
 * Host owns head/tail/count (32-bit lock-free style for single producer probe).
 * GPU never enumerates/list slots; only copy/hash/scrub/cmp on host-chosen indices.
 */
struct PrivateRing {
  unsigned char *d_slots;   /* slots * env_bytes */
  unsigned char *d_scratch; /* one envelope staging (H2D then device copy — F3) */
  unsigned *d_mis;
  unsigned long long *d_hash;
  unsigned slots;
  unsigned env_bytes;
  unsigned head;            /* next push index */
  unsigned tail;            /* next drop index */
  unsigned count;           /* occupied (= occupancy) */
  unsigned push_count;      /* total pushes (u32 wrap ok) */
  unsigned drop_count;      /* scrub-advanced drops (overwrite + drain + scrub) */
  unsigned overwrite_count; /* drops forced by push-on-full */
  unsigned drain_count;     /* slots drained via --ring-drain */
  Seq64 seq;
  int live;
};

static PrivateRing g_ring;

struct Options {
  int json;
  int do_copy;
  int do_hash;
  int do_scrub;
  int do_seq;
  int do_ring_push;
  int do_ring_hash;
  int do_ring_scrub;
  int do_ring_drain;
  int do_ring_verify;
  int any_flag;
  int ring_flag;
  int serve;
  unsigned batch;
  unsigned env_bytes;
  unsigned ring_slots;
  unsigned ring_slot; /* UINT_MAX = auto (last push / tail) */
  int ring_slot_set;
  unsigned ring_drain_n; /* --ring-drain N */
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
  int ok_ring_push;
  int ok_ring_hash;
  int ok_ring_scrub;
  int ok_ring_drain;
  int ok_ring_verify;
  int ok_ring;
  unsigned long long h_hash;
  unsigned long long expect_hash;
  unsigned long long ring_hash;
  unsigned long long ring_expect;
  Seq64 seq_start;
  Seq64 seq_end;
  Seq64 ring_seq;
  unsigned scrub_bytes;
  unsigned cmp_mismatches;
  unsigned ring_slots;
  unsigned ring_env_bytes;
  unsigned ring_slot;
  unsigned ring_head;
  unsigned ring_tail;
  unsigned ring_count;
  unsigned ring_occupancy; /* alias of count for fill/drain stats */
  unsigned ring_push_count;
  unsigned ring_drop_count;
  unsigned ring_overwrite_count;
  unsigned ring_drain_count;
  unsigned ring_drained; /* slots drained this call */
  unsigned ring_verify_checked;
  unsigned ring_verify_mismatches;
  double ms;
  int cuda_err;
};

static void usage(const char *argv0) {
  std::fprintf(stderr,
    "usage: %s [--json] [--copy] [--hash] [--scrub] [--seq]\n"
    "          [--ring-push] [--ring-hash] [--ring-scrub]\n"
    "          [--ring-drain N] [--ring-verify]\n"
    "          [--ring-slots N] [--ring-slot I]\n"
    "          [--batch N] [--env-bytes B] [--loops N] [--serve] [payload]\n"
    "  default: all probes (copy+hash+scrub+seq)\n"
    "  --ring-*     fixed private-slot ring (host index; GPU hash/copy/scrub/cmp)\n"
    "  --ring-drain N  hash+scrub N slots from tail; host advances index\n"
    "  --ring-verify   re-hash all occupied slots; report mismatches\n"
    "  --loops N    repeat probes in-process (reports ms_*); N>=1\n"
    "  --serve      stdin lines of CLI args; one JSON reply per line; 'quit' ends\n"
    "  GPU private-slot assist only; does not list models\n",
    argv0 ? argv0 : "sm11_monitor");
}

static unsigned ring_mod(unsigned idx, unsigned slots) {
  return slots ? (idx % slots) : 0u;
}

static void ring_reset_host_counters(PrivateRing *r) {
  r->head = 0;
  r->tail = 0;
  r->count = 0;
  r->push_count = 0;
  r->drop_count = 0;
  r->overwrite_count = 0;
  r->drain_count = 0;
  r->seq.hi = 0;
  r->seq.lo = 0;
}

static void ring_free(PrivateRing *r) {
  if (!r) return;
  if (r->d_slots) cudaFree(r->d_slots);
  if (r->d_scratch) cudaFree(r->d_scratch);
  if (r->d_mis) cudaFree(r->d_mis);
  if (r->d_hash) cudaFree(r->d_hash);
  std::memset(r, 0, sizeof(*r));
}

/* Ensure device ring matches slots×env_bytes. Reallocates if geometry changes. */
static int ring_ensure(PrivateRing *r, unsigned slots, unsigned env_bytes) {
  if (r->live && r->slots == slots && r->env_bytes == env_bytes) return 0;
  ring_free(r);
  const size_t bytes = (size_t)slots * (size_t)env_bytes;
  if (check(cudaMalloc((void **)&r->d_slots, bytes), "Malloc ring slots")) return 1;
  if (check(cudaMalloc((void **)&r->d_scratch, env_bytes), "Malloc ring scratch")) {
    ring_free(r);
    return 1;
  }
  if (check(cudaMalloc((void **)&r->d_mis, sizeof(unsigned)), "Malloc ring cmp")) {
    ring_free(r);
    return 1;
  }
  if (check(cudaMalloc((void **)&r->d_hash, sizeof(unsigned long long)), "Malloc ring hash")) {
    ring_free(r);
    return 1;
  }
  if (check(cudaMemset(r->d_slots, 0, bytes), "Memset ring")) {
    ring_free(r);
    return 1;
  }
  r->slots = slots;
  r->env_bytes = env_bytes;
  ring_reset_host_counters(r);
  r->live = 1;
  return 0;
}

static void ring_snapshot(const PrivateRing *ring, ProbeResult *r, int keep_seq) {
  r->ring_slots = ring->slots;
  r->ring_env_bytes = ring->env_bytes;
  r->ring_head = ring->head;
  r->ring_tail = ring->tail;
  r->ring_count = ring->count;
  r->ring_occupancy = ring->count;
  r->ring_push_count = ring->push_count;
  r->ring_drop_count = ring->drop_count;
  r->ring_overwrite_count = ring->overwrite_count;
  r->ring_drain_count = ring->drain_count;
  /* Push already stamped r->ring_seq; otherwise expose next seq. */
  if (!keep_seq) r->ring_seq = ring->seq;
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
  opt->do_ring_push = 0;
  opt->do_ring_hash = 0;
  opt->do_ring_scrub = 0;
  opt->do_ring_drain = 0;
  opt->do_ring_verify = 0;
  opt->any_flag = 0;
  opt->ring_flag = 0;
  opt->serve = 0;
  opt->batch = SM11_DEFAULT_BATCH;
  opt->env_bytes = SM11_DEFAULT_ENV_BYTES;
  opt->ring_slots = SM11_DEFAULT_RING_SLOTS;
  opt->ring_slot = 0xffffffffu;
  opt->ring_slot_set = 0;
  opt->ring_drain_n = 0;
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
    if (std::strcmp(a, "--ring-push") == 0) {
      opt->do_ring_push = 1;
      opt->any_flag = 1;
      opt->ring_flag = 1;
      continue;
    }
    if (std::strcmp(a, "--ring-hash") == 0) {
      opt->do_ring_hash = 1;
      opt->any_flag = 1;
      opt->ring_flag = 1;
      continue;
    }
    if (std::strcmp(a, "--ring-scrub") == 0) {
      opt->do_ring_scrub = 1;
      opt->any_flag = 1;
      opt->ring_flag = 1;
      continue;
    }
    if (std::strcmp(a, "--ring-drain") == 0) {
      if (i + 1 >= argc || parse_u(argv[++i], &opt->ring_drain_n) || opt->ring_drain_n < 1u) {
        std::fprintf(stderr, "bad --ring-drain\n");
        return 1;
      }
      opt->do_ring_drain = 1;
      opt->any_flag = 1;
      opt->ring_flag = 1;
      continue;
    }
    if (std::strcmp(a, "--ring-verify") == 0) {
      opt->do_ring_verify = 1;
      opt->any_flag = 1;
      opt->ring_flag = 1;
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
    if (std::strcmp(a, "--ring-slots") == 0) {
      if (i + 1 >= argc || parse_u(argv[++i], &opt->ring_slots)) {
        std::fprintf(stderr, "bad --ring-slots\n");
        return 1;
      }
      continue;
    }
    if (std::strcmp(a, "--ring-slot") == 0) {
      if (i + 1 >= argc || parse_u(argv[++i], &opt->ring_slot)) {
        std::fprintf(stderr, "bad --ring-slot\n");
        return 1;
      }
      opt->ring_slot_set = 1;
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
  /* Ring-only commands skip legacy default probe set when mixed with nothing else —
   * ring_flag already set any_flag so defaults above are skipped. */
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
  if (opt->ring_slots < SM11_MIN_RING_SLOTS || opt->ring_slots > SM11_MAX_RING_SLOTS) {
    std::fprintf(stderr, "ring-slots %u out of range (%u..%u)\n",
                 opt->ring_slots, SM11_MIN_RING_SLOTS, SM11_MAX_RING_SLOTS);
    return 5;
  }
  if (opt->ring_slot_set && opt->ring_slot >= opt->ring_slots) {
    std::fprintf(stderr, "ring-slot %u >= ring-slots %u\n", opt->ring_slot, opt->ring_slots);
    return 5;
  }
  const size_t batch_bytes = (size_t)opt->batch * (size_t)opt->env_bytes;
  const size_t ring_bytes = (size_t)opt->ring_slots * (size_t)opt->env_bytes;
  if (batch_bytes > 32u * 1024u * 1024u || ring_bytes > 16u * 1024u * 1024u) {
    std::fprintf(stderr, "batch/ring footprint too large for 8600 probe\n");
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
  r->ok_ring_push = 1;
  r->ok_ring_hash = 1;
  r->ok_ring_scrub = 1;
  r->ok_ring_drain = 1;
  r->ok_ring_verify = 1;
  r->ok_ring = 1;
  r->h_hash = 0;
  r->expect_hash = 0;
  r->ring_hash = 0;
  r->ring_expect = 0;
  r->seq_start.hi = 0;
  r->seq_start.lo = 0xfffffffeu;
  r->seq_end.hi = 0;
  r->seq_end.lo = 0;
  r->ring_seq.hi = 0;
  r->ring_seq.lo = 0;
  r->scrub_bytes = 0;
  r->cmp_mismatches = 0;
  r->ring_slots = 0;
  r->ring_env_bytes = 0;
  r->ring_slot = 0xffffffffu;
  r->ring_head = 0;
  r->ring_tail = 0;
  r->ring_count = 0;
  r->ring_occupancy = 0;
  r->ring_push_count = 0;
  r->ring_drop_count = 0;
  r->ring_overwrite_count = 0;
  r->ring_drain_count = 0;
  r->ring_drained = 0;
  r->ring_verify_checked = 0;
  r->ring_verify_mismatches = 0;
  r->ms = 0;
  r->cuda_err = 0;
}

/* Scrub one occupied slot at tail (drop). Host advances index; GPU zeros bytes. */
static int ring_scrub_tail(PrivateRing *ring, unsigned threads, ProbeResult *r) {
  if (ring->count == 0u) {
    r->ok_ring_scrub = 1;
    r->ring_slot = 0xffffffffu;
    return 0;
  }
  const unsigned slot = ring->tail;
  unsigned char *d_slot = ring->d_slots + (size_t)slot * ring->env_bytes;
  k_scrub_zero<<<blocks_for(ring->env_bytes, threads), threads>>>(d_slot, ring->env_bytes);
  if (check(cudaDeviceSynchronize(), "sync ring scrub")) { r->cuda_err = 1; return 1; }

  std::vector<unsigned char> back(ring->env_bytes);
  if (check(cudaMemcpy(back.data(), d_slot, ring->env_bytes, cudaMemcpyDeviceToHost), "D2H ring scrub")) {
    r->cuda_err = 1; return 1;
  }
  int zero_ok = 1;
  for (unsigned i = 0; i < ring->env_bytes; i++) {
    if (back[i] != 0) { zero_ok = 0; break; }
  }
  r->ok_ring_scrub = zero_ok ? 1 : 0;
  r->ring_slot = slot;
  ring->tail = ring_mod(ring->tail + 1u, ring->slots);
  ring->count -= 1u;
  ring->drop_count += 1u;
  return 0;
}

/*
 * Push envelope: H2D into scratch, device copy into private slot (F3/F21),
 * stamp seq on host, hash slot. If full, scrub oldest first.
 */
static int ring_push_once(PrivateRing *ring, const unsigned char *payload, unsigned n_payload,
                          unsigned threads, ProbeResult *r) {
  if (ring->count >= ring->slots) {
    if (ring_scrub_tail(ring, threads, r)) return 1;
    if (!r->ok_ring_scrub) { r->ok_ring_push = 0; return 0; }
    ring->overwrite_count += 1u;
  }

  std::vector<unsigned char> host(ring->env_bytes, 0);
  const unsigned copy_n = n_payload < ring->env_bytes ? n_payload : ring->env_bytes;
  if (copy_n) std::memcpy(host.data(), payload, copy_n);

  if (check(cudaMemcpy(ring->d_scratch, host.data(), ring->env_bytes, cudaMemcpyHostToDevice),
            "H2D ring scratch")) {
    r->cuda_err = 1; return 1;
  }

  const unsigned slot = ring->head;
  unsigned char *d_slot = ring->d_slots + (size_t)slot * ring->env_bytes;
  k_copy<<<blocks_for(ring->env_bytes, threads), threads>>>(ring->d_scratch, d_slot, ring->env_bytes);
  if (check(cudaDeviceSynchronize(), "sync ring copy")) { r->cuda_err = 1; return 1; }

  unsigned zero = 0;
  if (check(cudaMemcpy(ring->d_mis, &zero, sizeof(zero), cudaMemcpyHostToDevice), "H2D ring cmp0")) {
    r->cuda_err = 1; return 1;
  }
  k_cmp<<<blocks_for(ring->env_bytes, threads), threads>>>(ring->d_scratch, d_slot, ring->env_bytes, ring->d_mis);
  if (check(cudaDeviceSynchronize(), "sync ring cmp")) { r->cuda_err = 1; return 1; }
  unsigned mis = 0;
  if (check(cudaMemcpy(&mis, ring->d_mis, sizeof(mis), cudaMemcpyDeviceToHost), "D2H ring cmp")) {
    r->cuda_err = 1; return 1;
  }
  r->cmp_mismatches = mis;
  r->ok_cmp = (mis == 0u) ? 1 : 0;

  Seq64 stamped = ring->seq;
  k_fnv1a<<<1, 1>>>(d_slot, ring->env_bytes, ring->d_hash);
  if (check(cudaDeviceSynchronize(), "sync ring hash")) { r->cuda_err = 1; return 1; }
  if (check(cudaMemcpy(&r->ring_hash, ring->d_hash, sizeof(r->ring_hash), cudaMemcpyDeviceToHost),
            "D2H ring hash")) {
    r->cuda_err = 1; return 1;
  }
  r->ring_expect = fnv1a64_host(host.data(), ring->env_bytes);
  r->ok_ring_hash = (r->ring_hash == r->ring_expect) ? 1 : 0;

  r->ring_slot = slot;
  r->ring_seq = stamped;
  r->ok_ring_push = (r->ok_cmp && r->ok_ring_hash) ? 1 : 0;

  seq64_inc(&ring->seq);
  ring->head = ring_mod(ring->head + 1u, ring->slots);
  ring->count += 1u;
  ring->push_count += 1u;
  return 0;
}

static int ring_hash_slot(PrivateRing *ring, unsigned slot, unsigned threads, ProbeResult *r) {
  if (slot >= ring->slots) {
    r->ok_ring_hash = 0;
    return 0;
  }
  unsigned char *d_slot = ring->d_slots + (size_t)slot * ring->env_bytes;
  k_fnv1a<<<1, 1>>>(d_slot, ring->env_bytes, ring->d_hash);
  if (check(cudaDeviceSynchronize(), "sync ring hash2")) { r->cuda_err = 1; return 1; }
  if (check(cudaMemcpy(&r->ring_hash, ring->d_hash, sizeof(r->ring_hash), cudaMemcpyDeviceToHost),
            "D2H ring hash2")) {
    r->cuda_err = 1; return 1;
  }
  std::vector<unsigned char> back(ring->env_bytes);
  if (check(cudaMemcpy(back.data(), d_slot, ring->env_bytes, cudaMemcpyDeviceToHost), "D2H ring slot")) {
    r->cuda_err = 1; return 1;
  }
  r->ring_expect = fnv1a64_host(back.data(), ring->env_bytes);
  r->ok_ring_hash = (r->ring_hash == r->ring_expect) ? 1 : 0;
  r->ring_slot = slot;
  return 0;
}

/*
 * Host-assisted drain: for up to N occupied slots from tail, GPU hash then scrub;
 * host advances tail/count. Mirrors mailbox drain (producer never waits).
 */
static int ring_drain_n(PrivateRing *ring, unsigned n, unsigned threads, ProbeResult *r) {
  unsigned drained = 0;
  r->ok_ring_drain = 1;
  r->ok_ring_hash = 1;
  r->ok_ring_scrub = 1;
  r->ring_drained = 0;
  while (drained < n && ring->count > 0u) {
    const unsigned slot = ring->tail;
    if (ring_hash_slot(ring, slot, threads, r)) return 1;
    if (!r->ok_ring_hash) {
      r->ok_ring_drain = 0;
      break;
    }
    if (ring_scrub_tail(ring, threads, r)) return 1;
    if (!r->ok_ring_scrub) {
      r->ok_ring_drain = 0;
      break;
    }
    ring->drain_count += 1u;
    drained += 1u;
  }
  r->ring_drained = drained;
  if (drained == 0u && n > 0u && ring->count == 0u) {
    /* Empty ring: drain of zero is ok (mailbox-style no-op). */
    r->ok_ring_drain = 1;
    r->ring_slot = 0xffffffffu;
  }
  return 0;
}

/*
 * Host walks occupied indices (tail..); GPU hashes each chosen slot.
 * Mismatch = device FNV != host FNV of D2H bytes. GPU MUST NOT list.
 */
static int ring_verify_occupied(PrivateRing *ring, unsigned threads, ProbeResult *r) {
  unsigned checked = 0;
  unsigned mismatches = 0;
  unsigned idx = ring->tail;
  r->ok_ring_verify = 1;
  r->ok_ring_hash = 1;
  for (unsigned i = 0; i < ring->count; i++) {
    if (ring_hash_slot(ring, idx, threads, r)) return 1;
    checked += 1u;
    if (!r->ok_ring_hash) mismatches += 1u;
    idx = ring_mod(idx + 1u, ring->slots);
  }
  r->ring_verify_checked = checked;
  r->ring_verify_mismatches = mismatches;
  r->ok_ring_verify = (mismatches == 0u) ? 1 : 0;
  if (checked == 0u) r->ring_slot = 0xffffffffu;
  return 0;
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

  if (opt->ring_flag) {
    if (ring_ensure(&g_ring, opt->ring_slots, opt->env_bytes)) {
      r->cuda_err = 1;
      r->ok_ring = 0;
      r->ms = wall_ms_now() - t0;
      return 2;
    }

    if (opt->do_ring_push) {
      if (ring_push_once(&g_ring, (const unsigned char *)opt->payload, n_payload, threads, r)) {
        r->ok_ring = 0;
        r->ms = wall_ms_now() - t0;
        return 2;
      }
    }

    if (opt->do_ring_hash) {
      unsigned slot = opt->ring_slot_set ? opt->ring_slot
                    : (r->ring_slot != 0xffffffffu ? r->ring_slot
                       : (g_ring.count ? ring_mod(g_ring.head + g_ring.slots - 1u, g_ring.slots)
                                       : 0u));
      if (ring_hash_slot(&g_ring, slot, threads, r)) {
        r->ok_ring = 0;
        r->ms = wall_ms_now() - t0;
        return 2;
      }
    }

    if (opt->do_ring_scrub) {
      if (opt->ring_slot_set) {
        /* Explicit slot scrub without advancing tail (overwrite/clear assist). */
        unsigned slot = opt->ring_slot;
        unsigned char *d_slot = g_ring.d_slots + (size_t)slot * g_ring.env_bytes;
        k_scrub_zero<<<blocks_for(g_ring.env_bytes, threads), threads>>>(d_slot, g_ring.env_bytes);
        if (check(cudaDeviceSynchronize(), "sync ring scrub slot")) {
          r->cuda_err = 1; r->ok_ring = 0; r->ms = wall_ms_now() - t0; return 2;
        }
        std::vector<unsigned char> back(g_ring.env_bytes);
        if (check(cudaMemcpy(back.data(), d_slot, g_ring.env_bytes, cudaMemcpyDeviceToHost),
                  "D2H ring scrub slot")) {
          r->cuda_err = 1; r->ok_ring = 0; r->ms = wall_ms_now() - t0; return 2;
        }
        int zero_ok = 1;
        for (unsigned i = 0; i < g_ring.env_bytes; i++) {
          if (back[i] != 0) { zero_ok = 0; break; }
        }
        r->ok_ring_scrub = zero_ok ? 1 : 0;
        r->ring_slot = slot;
      } else {
        if (ring_scrub_tail(&g_ring, threads, r)) {
          r->ok_ring = 0;
          r->ms = wall_ms_now() - t0;
          return 2;
        }
      }
    }

    if (opt->do_ring_drain) {
      if (ring_drain_n(&g_ring, opt->ring_drain_n, threads, r)) {
        r->ok_ring = 0;
        r->ms = wall_ms_now() - t0;
        return 2;
      }
    }

    if (opt->do_ring_verify) {
      if (ring_verify_occupied(&g_ring, threads, r)) {
        r->ok_ring = 0;
        r->ms = wall_ms_now() - t0;
        return 2;
      }
    }

    ring_snapshot(&g_ring, r, opt->do_ring_push ? 1 : 0);
    r->ok_ring = 1;
    if (opt->do_ring_push && !r->ok_ring_push) r->ok_ring = 0;
    if (opt->do_ring_hash && !r->ok_ring_hash) r->ok_ring = 0;
    if (opt->do_ring_scrub && !r->ok_ring_scrub) r->ok_ring = 0;
    if (opt->do_ring_drain && !r->ok_ring_drain) r->ok_ring = 0;
    if (opt->do_ring_verify && !r->ok_ring_verify) r->ok_ring = 0;

    /* Ring-only invocation: skip legacy probes unless also requested. */
    if (!opt->do_copy && !opt->do_hash && !opt->do_scrub && !opt->do_seq) {
      r->ms = wall_ms_now() - t0;
      return 0;
    }
  }

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
  if (opt->ring_flag && !r->ok_ring) return 0;
  if (opt->do_ring_push && !r->ok_ring_push) return 0;
  if (opt->do_ring_hash && !r->ok_ring_hash) return 0;
  if (opt->do_ring_scrub && !r->ok_ring_scrub) return 0;
  if (opt->do_ring_drain && !r->ok_ring_drain) return 0;
  if (opt->do_ring_verify && !r->ok_ring_verify) return 0;
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
  if (opt->ring_flag) {
    std::printf("\"ring_ok\":%s,\"ring_slots\":%u,\"ring_env_bytes\":%u,",
                r->ok_ring ? "true" : "false", r->ring_slots, r->ring_env_bytes);
    std::printf("\"ring_slot\":%u,\"ring_head\":%u,\"ring_tail\":%u,\"ring_count\":%u,",
                r->ring_slot, r->ring_head, r->ring_tail, r->ring_count);
    std::printf("\"ring_occupancy\":%u,\"ring_push_count\":%u,\"ring_drop_count\":%u,",
                r->ring_occupancy, r->ring_push_count, r->ring_drop_count);
    std::printf("\"ring_overwrite_count\":%u,\"ring_drain_count\":%u,",
                r->ring_overwrite_count, r->ring_drain_count);
    std::printf("\"ring_seq\":{\"hi\":%u,\"lo\":%u},", r->ring_seq.hi, r->ring_seq.lo);
    if (opt->do_ring_push) {
      std::printf("\"ring_push_ok\":%s,\"ring_cmp_ok\":%s,\"ring_cmp_mismatches\":%u,",
                  r->ok_ring_push ? "true" : "false",
                  r->ok_cmp ? "true" : "false", r->cmp_mismatches);
    }
    if (opt->do_ring_push || opt->do_ring_hash || opt->do_ring_drain) {
      std::printf("\"ring_hash_ok\":%s,\"ring_hash\":\"0x%016llx\",\"ring_expect\":\"0x%016llx\",",
                  r->ok_ring_hash ? "true" : "false",
                  (unsigned long long)r->ring_hash, (unsigned long long)r->ring_expect);
    }
    if (opt->do_ring_scrub) {
      std::printf("\"ring_scrub_ok\":%s,", r->ok_ring_scrub ? "true" : "false");
    }
    if (opt->do_ring_drain) {
      std::printf("\"ring_drain_ok\":%s,\"ring_drained\":%u,",
                  r->ok_ring_drain ? "true" : "false", r->ring_drained);
    }
    if (opt->do_ring_verify) {
      std::printf("\"ring_verify_ok\":%s,\"ring_verify_checked\":%u,\"ring_verify_mismatches\":%u,",
                  r->ok_ring_verify ? "true" : "false",
                  r->ring_verify_checked, r->ring_verify_mismatches);
    }
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
  if (opt->ring_flag) {
    std::printf("ring_ok=%d slots=%u env=%u slot=%u head=%u tail=%u count=%u occ=%u push=%u drop=%u overwrite=%u drain=%u\n",
                r->ok_ring, r->ring_slots, r->ring_env_bytes, r->ring_slot,
                r->ring_head, r->ring_tail, r->ring_count, r->ring_occupancy,
                r->ring_push_count, r->ring_drop_count, r->ring_overwrite_count, r->ring_drain_count);
    if (opt->do_ring_push) {
      std::printf("ring_push_ok=%d cmp_ok=%d cmp_mismatches=%u seq=%u:%u\n",
                  r->ok_ring_push, r->ok_cmp, r->cmp_mismatches, r->ring_seq.hi, r->ring_seq.lo);
    }
    if (opt->do_ring_push || opt->do_ring_hash || opt->do_ring_drain) {
      std::printf("ring_hash_ok=%d ring_hash=0x%016llx expect=0x%016llx\n",
                  r->ok_ring_hash,
                  (unsigned long long)r->ring_hash, (unsigned long long)r->ring_expect);
    }
    if (opt->do_ring_scrub) {
      std::printf("ring_scrub_ok=%d\n", r->ok_ring_scrub);
    }
    if (opt->do_ring_drain) {
      std::printf("ring_drain_ok=%d drained=%u\n", r->ok_ring_drain, r->ring_drained);
    }
    if (opt->do_ring_verify) {
      std::printf("ring_verify_ok=%d checked=%u mismatches=%u\n",
                  r->ok_ring_verify, r->ring_verify_checked, r->ring_verify_mismatches);
    }
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
