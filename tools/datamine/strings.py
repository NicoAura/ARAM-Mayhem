"""Look up League string-table entries by key.

Most keys are stored as the lowercase key's xxh3_64 hash truncated to 38 bits,
written as "{%010x}". Requires: pip install xxhash
"""
import json
import xxhash

def key_hash(key, bits=38):
    return "{%010x}" % (xxhash.xxh3_64_intdigest(key.lower().encode()) & ((1 << bits) - 1))

class StringTable:
    def __init__(self, path):
        self.entries = json.load(open(path))["entries"]

    def get(self, key):
        if key.lower() in self.entries:
            return self.entries[key.lower()]
        return self.entries.get(key_hash(key))
