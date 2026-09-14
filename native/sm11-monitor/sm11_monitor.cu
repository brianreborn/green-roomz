/*
 * sm11_monitor.cu — minimal 8600 GT (sm_1.1) probe for security-monitor path.
 * CUDA 6.5 / compute_11: payload FNV-1a + device copy (F3/F21 private slot).
 * Build: native/sm11-monitor/build.bat
 */
#include <cuda_runtime.h>
#include <cstdio>
#include <cstdint>
#include <cstring>
#include <vector>

#ifndef SM11_MAX_BYTES
#define SM11_MAX_BYTES 4096
#endif

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

__global__ void k_copy(const unsigned char *src, unsigned char *dst, unsigned n) {
  unsigned i = blockIdx.x * blockDim.x + threadIdx.x;
  if (i < n) dst[i] = src[i];
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

int main(int argc, char **argv) {
  int device_count = 0;
  if (check(cudaGetDeviceCount(&device_count), "GetDeviceCount")) return 2;
  if (device_count < 1) {
    std::fprintf(stderr, "no CUDA devices\n");
    return 3;
  }

  cudaDeviceProp prop;
  if (check(cudaGetDeviceProperties(&prop, 0), "GetDeviceProperties")) return 2;
  std::printf("device0=%s sm_%d%d vram_mb=%u\n",
              prop.name, prop.major, prop.minor,
              (unsigned)(prop.totalGlobalMem / (1024 * 1024)));

  if (prop.major < 1 || (prop.major == 1 && prop.minor < 1)) {
    std::fprintf(stderr, "need sm_1.1+\n");
    return 4;
  }

  const char *msg = (argc > 1) ? argv[1] : "green-roomz-mailbox-probe";
  unsigned n = (unsigned)std::strlen(msg);
  if (n == 0 || n > SM11_MAX_BYTES) {
    std::fprintf(stderr, "payload length %u out of range\n", n);
    return 5;
  }

  std::vector<unsigned char> host(msg, msg + n);
  unsigned char *d_src = NULL;
  unsigned char *d_dst = NULL;
  unsigned long long *d_hash = NULL;
  unsigned long long h_hash = 0;

  if (check(cudaMalloc((void **)&d_src, n), "Malloc src")) return 2;
  if (check(cudaMalloc((void **)&d_dst, n), "Malloc dst")) return 2;
  if (check(cudaMalloc((void **)&d_hash, sizeof(unsigned long long)), "Malloc hash")) return 2;
  if (check(cudaMemcpy(d_src, host.data(), n, cudaMemcpyHostToDevice), "H2D")) return 2;

  k_copy<<<(n + 127) / 128, 128>>>(d_src, d_dst, n);
  if (check(cudaDeviceSynchronize(), "sync copy")) return 2;

  k_fnv1a<<<1, 1>>>(d_dst, n, d_hash);
  if (check(cudaDeviceSynchronize(), "sync hash")) return 2;
  if (check(cudaMemcpy(&h_hash, d_hash, sizeof(h_hash), cudaMemcpyDeviceToHost), "D2H hash")) return 2;

  std::vector<unsigned char> back(n);
  if (check(cudaMemcpy(back.data(), d_dst, n, cudaMemcpyDeviceToHost), "D2H copy")) return 2;

  unsigned long long expect = fnv1a64_host(host.data(), n);
  int ok_copy = (std::memcmp(host.data(), back.data(), n) == 0);
  int ok_hash = (h_hash == expect);

  std::printf("copy_ok=%d hash_ok=%d hash=0x%016llx expect=0x%016llx\n",
              ok_copy, ok_hash,
              (unsigned long long)h_hash, (unsigned long long)expect);

  cudaFree(d_src);
  cudaFree(d_dst);
  cudaFree(d_hash);

  return (ok_copy && ok_hash) ? 0 : 1;
}
