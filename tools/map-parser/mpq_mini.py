"""Minimal read-only MPQ table parser for M0 research.

Not a general-purpose extractor. It reads the MPQ hash/block tables from a
Warcraft III map and can dump unencrypted files (optionally zlib-compressed).
Used because StormLib / cmake are not available in this environment.
"""

import struct
import sys
import zlib

CRYPT = [0] * 0x500
_seed = 0x00100001
for _i in range(0x100):
    for _j in range(5):
        _seed = (_seed * 125 + 3) % 0x2AAAAB
        _t1 = (_seed & 0xFFFF) << 0x10
        _seed = (_seed * 125 + 3) % 0x2AAAAB
        _t2 = _seed & 0xFFFF
        CRYPT[_i + _j * 0x100] = _t1 | _t2


def hash_string(value: str, kind: int) -> int:
    s1 = 0x7FED7FED
    s2 = 0xEEEEEEEE
    for ch in value.upper().encode("latin1", errors="replace"):
        s1 = CRYPT[(kind << 8) + ch] ^ ((s1 + s2) & 0xFFFFFFFF)
        s2 = (ch + s1 + s2 + (s2 << 5) + 3) & 0xFFFFFFFF
    return s1 & 0xFFFFFFFF


def decrypt(data: bytes, key: int) -> bytes:
    word_bytes = (len(data) // 4) * 4
    tail = data[word_bytes:]
    words = list(struct.unpack("<%dI" % (len(data) // 4), data[:word_bytes]))
    s1 = key & 0xFFFFFFFF
    s2 = 0xEEEEEEEE
    for i in range(len(words)):
        s2 = (s2 + CRYPT[0x400 + (s1 & 0xFF)]) & 0xFFFFFFFF
        ch = words[i] ^ ((s1 + s2) & 0xFFFFFFFF)
        s1 = (((~s1 << 21) + 0x11111111) | (s1 >> 11)) & 0xFFFFFFFF
        s2 = (ch + s2 + (s2 << 5) + 3) & 0xFFFFFFFF
        words[i] = ch & 0xFFFFFFFF
    return struct.pack("<%dI" % len(words), *words) + tail


class Mpq:
    def __init__(self, path: str):
        self.data = open(path, "rb").read()
        pos = self.data.find(b"MPQ\x1A")
        if pos < 0:
            raise ValueError("no MPQ header")
        self.base = pos
        d = self.data[pos:]
        (
            header_size,
            archive_size,
            version,
            block_shift,
            hash_pos,
            block_pos,
            hash_count,
            block_count,
        ) = struct.unpack_from("<IIHHIIII", d, 4)
        self.sector_size = 512 << block_shift
        self.hash_count = hash_count
        self.block_count = block_count
        raw_hash = d[hash_pos:hash_pos + hash_count * 16]
        raw_block = d[block_pos:block_pos + block_count * 16]
        self.hash_table = list(struct.iter_unpack("<IIHHI", decrypt(raw_hash, hash_string("(hash table)", 3))))
        self.block_table = list(struct.iter_unpack("<IIII", decrypt(raw_block, hash_string("(block table)", 3))))
        self.valid_blocks = sum(1 for e in self.hash_table if e[4] != 0xFFFFFFFF)

    def block_index(self, name: str) -> int | None:
        a, b = hash_string(name.replace("/", "\\"), 1), hash_string(name.replace("/", "\\"), 2)
        start = hash_string(name.replace("/", "\\"), 0) % self.hash_count
        for i in range(self.hash_count):
            e = self.hash_table[(start + i) % self.hash_count]
            if e[4] == 0xFFFFFFFF:
                return None
            if e[0] == a and e[1] == b:
                return e[4]
        return None

    def read(self, name: str) -> bytes | None:
        idx = self.block_index(name)
        if idx is None or idx >= len(self.block_table):
            return None
        file_pos, compressed_size, file_size, flags = self.block_table[idx]
        raw = self.data[self.base + file_pos:self.base + file_pos + compressed_size]
        key = 0
        if flags & 0x00010000:  # encrypted
            key = (hash_string(name.replace("/", "\\"), 3) + file_pos) & 0xFFFFFFFF
            if flags & 0x00020000:  # key v2
                key = (key ^ file_size) & 0xFFFFFFFF

        def inflate(sector: bytes) -> bytes:
            if not sector:
                return sector
            kind = sector[0]
            if kind & 0x02:  # zlib
                try:
                    return zlib.decompress(sector[1:])
                except zlib.error:
                    return sector[1:]  # 其它压缩方式（本工具只读研究用，不解码）
            return sector[1:] if kind else sector

        if flags & 0x01000000:  # single unit
            data = decrypt(raw, key) if key else raw
            return inflate(data)[:file_size]
        if not (flags & 0x00000200):
            data = decrypt(raw, key) if key else raw
            return data[:file_size]

        # 多扇区压缩：扇区偏移表（可选 CRC） + 每扇区压缩类型字节
        sector_count = (file_size + self.sector_size - 1) // self.sector_size
        table_size = (sector_count + 1) * 4
        if len(raw) < table_size:
            return None
        table = raw[:table_size]
        if key:
            table = decrypt(table, (key - 1) & 0xFFFFFFFF)
        offsets = struct.unpack("<%dI" % (sector_count + 1), table)
        out = bytearray()
        has_crc = bool(flags & 0x04000000)
        for i in range(sector_count):
            if offsets[i + 1] > len(raw):
                return None
            sector = raw[offsets[i]:offsets[i + 1]]
            if key:
                sector = decrypt(sector, (key + i) & 0xFFFFFFFF)
            if has_crc and len(sector) > 4:
                sector = sector[4:]
            out += inflate(sector)
        return bytes(out[:file_size])


if __name__ == "__main__":
    mpq = Mpq(sys.argv[1])
    print("mpq_base", mpq.base, "hash_entries", mpq.hash_count, "block_entries", mpq.block_count, "valid", mpq.valid_blocks)
    names = []
    for name in ["(listfile)", "(attributes)", "war3map.w3i", "war3map.w3e", "war3map.w3u", "war3map.w3t",
                 "war3map.w3a", "war3map.w3h", "war3map.w3q", "war3map.w3d", "war3map.w3b", "war3map.j",
                 "war3map.lua", "war3map.doo", "war3mapUnits.doo", "war3map.wpm", "war3map.shd",
                 "war3map.mmp", "war3mapMap.blp", "war3mapSkin.txt", "war3mapMisc.txt"]:
        found = mpq.block_index(name) is not None
        data = mpq.read(name) if found else None
        print(f"{name:22} found={found} size={len(data) if data is not None else '-'}")
        if name == "(listfile)" and data:
            names = [x.strip().replace("\\", "/") for x in data.decode("latin1").splitlines() if x.strip()]
            print("listfile entries", len(names))
    if len(sys.argv) > 2 and sys.argv[2] == "--listfile":
        for n in names:
            print(n)
