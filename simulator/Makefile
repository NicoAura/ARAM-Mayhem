CXX ?= c++
CXXFLAGS ?= -std=c++17 -O2 -Wall -Wextra -pedantic
EMCC ?= emcc

SRC := src/sim.cpp src/main.cpp
HDR := src/sim.hpp src/json.hpp

.PHONY: all run test wasm clean

all: yunara_sim

yunara_sim: $(SRC) $(HDR)
	$(CXX) $(CXXFLAGS) -pthread $(SRC) -o $@

run: yunara_sim
	./yunara_sim

sanity_test: src/sim.cpp tests/sanity.cpp $(HDR)
	$(CXX) $(CXXFLAGS) src/sim.cpp tests/sanity.cpp -o $@

test: sanity_test
	./sanity_test data/yunara_mayhem.json

# Browser build (needs Emscripten). Single-threaded on purpose: the site runs
# one copy per Web Worker, so no SharedArrayBuffer or COOP/COEP headers needed.
wasm: $(SRC) $(HDR)
	mkdir -p dist
	$(EMCC) -std=c++17 -O2 src/sim.cpp src/main.cpp -o dist/yunara_sim.js \
		-sMODULARIZE -sEXPORT_NAME=YunaraSim -sALLOW_MEMORY_GROWTH \
		-sINVOKE_RUN=0 -sEXPORTED_RUNTIME_METHODS=callMain,FS \
		--preload-file data/yunara_mayhem.json

clean:
	rm -rf yunara_sim sanity_test dist
