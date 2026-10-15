CXX ?= c++
CXXFLAGS ?= -std=c++17 -O2 -Wall -Wextra -pedantic
EMCC ?= em++

SRC := src/sim.cpp src/main.cpp
HDR := src/sim.hpp src/json.hpp src/rng.hpp
CHAMP_SRC := src/sim.cpp src/champ.cpp src/champ_main.cpp
CHAMP_HDR := $(HDR) src/champ.hpp

.PHONY: all run test wasm wasm-mayhem clean replay

all: yunara_sim mayhem_sim

yunara_sim: $(SRC) $(HDR)
	$(CXX) $(CXXFLAGS) -pthread $(SRC) -o $@

run: yunara_sim
	./yunara_sim

mayhem_sim: $(CHAMP_SRC) $(CHAMP_HDR)
	$(CXX) $(CXXFLAGS) -pthread $(CHAMP_SRC) -o $@

sanity_test: src/sim.cpp tests/sanity.cpp $(HDR)
	$(CXX) $(CXXFLAGS) src/sim.cpp tests/sanity.cpp -o $@

champ_test: src/sim.cpp src/champ.cpp tests/champ_sanity.cpp $(CHAMP_HDR)
	$(CXX) $(CXXFLAGS) -pthread src/sim.cpp src/champ.cpp tests/champ_sanity.cpp -o $@

test: sanity_test champ_test mayhem_sim
	./sanity_test data/yunara_mayhem.json data/cn_enemy_pool.json
	./champ_test data/mayhem_rules.json
	./mayhem_sim --list --json | python3 -c "import json, sys; json.load(sys.stdin)" && echo "ok:   --list --json is valid JSON (the page reads it)"

# Browser build (needs Emscripten). Single-threaded on purpose: the site runs
# one copy per Web Worker, so no SharedArrayBuffer or COOP/COEP headers needed.
wasm: $(SRC) $(HDR)
	mkdir -p dist
	$(EMCC) -std=c++17 -O2 src/sim.cpp src/main.cpp -o dist/yunara_sim.js \
		-sMODULARIZE -sEXPORT_NAME=YunaraSim -sALLOW_MEMORY_GROWTH \
		-sINVOKE_RUN=0 -sEXPORTED_RUNTIME_METHODS=callMain,FS \
		--preload-file data/yunara_mayhem.json --preload-file data/cn_enemy_pool.json

# Browser build of the all-champion simulator for the replay viewer's controls (data embedded in the .wasm).
wasm-mayhem: $(CHAMP_SRC) $(CHAMP_HDR)
	mkdir -p dist
	$(EMCC) -std=c++17 -O2 $(CHAMP_SRC) -o dist/mayhem_sim.js \
		-sMODULARIZE -sEXPORT_NAME=MayhemSim -sALLOW_MEMORY_GROWTH -sENVIRONMENT=worker,web,node \
		-sINVOKE_RUN=0 -sEXIT_RUNTIME=0 -sEXPORTED_RUNTIME_METHODS=callMain,FS \
		--embed-file data/mayhem_rules.json --embed-file data/champions.json --embed-file data/items.json \
		--embed-file data/augments.json --embed-file data/cn_enemy_pool.json --embed-file data/combos.json

# Fight replays for viewer/: one traced fight per champion, plus Riot's icons and
# ability clips (CLIPS=--clips stores shrunk clips locally instead of streaming them).
# MODELS=1 also builds the animated 3D models (tools/build_models.mjs; needs the
# glTF-Transform packages listed there on NODE_PATH).
replay: mayhem_sim
	rm -rf viewer/replay-data/traces && mkdir -p viewer/replay-data/traces
	./mayhem_sim --all --trace-dir viewer/replay-data/traces --json > viewer/replay-data/best-builds.json
	python3 tools/build_replay_assets.py --traces viewer/replay-data/traces --out viewer/replay-data $(CLIPS)
	$(MAKE) wasm-mayhem && cp dist/mayhem_sim.js dist/mayhem_sim.wasm viewer/replay-data/
	$(if $(MODELS),node tools/build_models.mjs --index viewer/replay-data/index.json --out viewer/replay-data/models)

clean:
	rm -rf yunara_sim mayhem_sim sanity_test champ_test dist
