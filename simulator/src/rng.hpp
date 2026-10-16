// Random numbers for the simulators: own generator (xoshiro256**) so native
// and WebAssembly runs give identical results for the same seed.
#pragma once

#include <cmath>
#include <cstddef>
#include <cstdint>

namespace mcrng {

inline uint64_t splitmix(uint64_t& x) {
    uint64_t z = (x += 0x9E3779B97F4A7C15ULL);
    z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ULL;
    z = (z ^ (z >> 27)) * 0x94D049BB133111EBULL;
    return z ^ (z >> 31);
}

class Rng {
public:
    Rng(uint64_t seed, uint64_t stream) {
        uint64_t x = seed ^ (stream * 0xD1B54A32D192ED03ULL);
        for (auto& v : s_) v = splitmix(x);
    }
    uint64_t next() {
        const uint64_t result = rotl(s_[1] * 5, 7) * 9;
        const uint64_t t = s_[1] << 17;
        s_[2] ^= s_[0]; s_[3] ^= s_[1]; s_[1] ^= s_[2]; s_[0] ^= s_[3];
        s_[2] ^= t; s_[3] = rotl(s_[3], 45);
        return result;
    }
    double uniform() { return static_cast<double>(next() >> 11) * 0x1.0p-53; }
    double uniform(double a, double b) { return a + (b - a) * uniform(); }
    bool chance(double p) { return uniform() < p; }
    double normal(double mean, double sd) {
        double u1 = uniform();
        while (u1 <= 1e-300) u1 = uniform();
        double u2 = uniform();
        return mean + sd * std::sqrt(-2.0 * std::log(u1)) * std::cos(6.283185307179586 * u2);
    }
    double exponential(double rate) {
        double u = uniform();
        while (u <= 1e-300) u = uniform();
        return -std::log(u) / rate;
    }
    int binomial(int n, double p) {
        int k = 0;
        for (int i = 0; i < n; ++i) k += chance(p) ? 1 : 0;
        return k;
    }
    size_t pick(size_t n) { return static_cast<size_t>(uniform() * static_cast<double>(n)) % n; }

private:
    static uint64_t rotl(uint64_t x, int k) { return (x << k) | (x >> (64 - k)); }
    uint64_t s_[4];
};

}  // namespace mcrng
