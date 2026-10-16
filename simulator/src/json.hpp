// Minimal JSON reader, enough to load the simulator's data file without
// pulling in a dependency (keeps the native and WebAssembly builds simple).
#pragma once

#include <cctype>
#include <cstdlib>
#include <map>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

namespace json {

struct Value {
    enum class Type { Null, Bool, Number, String, Array, Object };
    Type type = Type::Null;
    bool b = false;
    double num = 0.0;
    std::string str;
    std::vector<Value> arr;
    std::map<std::string, Value> obj;

    bool isNull() const { return type == Type::Null; }
    bool isNumber() const { return type == Type::Number; }
    bool isString() const { return type == Type::String; }
    bool isArray() const { return type == Type::Array; }
    bool isObject() const { return type == Type::Object; }

    bool has(const std::string& key) const { return isObject() && obj.count(key) > 0; }

    const Value& operator[](const std::string& key) const {
        static const Value null;
        if (!isObject()) return null;
        auto it = obj.find(key);
        return it == obj.end() ? null : it->second;
    }
    const Value& operator[](size_t i) const { return arr.at(i); }
    size_t size() const { return isArray() ? arr.size() : obj.size(); }

    double asNumber(double fallback = 0.0) const { return isNumber() ? num : fallback; }
    std::string asString(const std::string& fallback = "") const { return isString() ? str : fallback; }
    bool asBool(bool fallback = false) const { return type == Type::Bool ? b : fallback; }
};

class Parser {
public:
    explicit Parser(const std::string& text) : s_(text) {}

    Value parse() {
        Value v = parseValue();
        skipWs();
        if (pos_ != s_.size()) fail("trailing characters");
        return v;
    }

private:
    const std::string& s_;
    size_t pos_ = 0;

    [[noreturn]] void fail(const std::string& msg) const {
        throw std::runtime_error("JSON parse error at offset " + std::to_string(pos_) + ": " + msg);
    }

    void skipWs() {
        while (pos_ < s_.size() && std::isspace(static_cast<unsigned char>(s_[pos_]))) ++pos_;
    }

    char peek() {
        skipWs();
        if (pos_ >= s_.size()) fail("unexpected end of input");
        return s_[pos_];
    }

    void expect(char c) {
        if (peek() != c) fail(std::string("expected '") + c + "'");
        ++pos_;
    }

    bool consumeLiteral(const char* lit) {
        size_t n = std::char_traits<char>::length(lit);
        if (s_.compare(pos_, n, lit) == 0) {
            pos_ += n;
            return true;
        }
        return false;
    }

    Value parseValue() {
        char c = peek();
        Value v;
        if (c == '{') return parseObject();
        if (c == '[') return parseArray();
        if (c == '"') {
            v.type = Value::Type::String;
            v.str = parseString();
            return v;
        }
        if (consumeLiteral("true")) { v.type = Value::Type::Bool; v.b = true; return v; }
        if (consumeLiteral("false")) { v.type = Value::Type::Bool; v.b = false; return v; }
        if (consumeLiteral("null")) return v;
        return parseNumber();
    }

    Value parseObject() {
        Value v;
        v.type = Value::Type::Object;
        expect('{');
        if (peek() == '}') { ++pos_; return v; }
        while (true) {
            if (peek() != '"') fail("expected object key");
            std::string key = parseString();
            expect(':');
            v.obj[key] = parseValue();
            char c = peek();
            ++pos_;
            if (c == '}') break;
            if (c != ',') fail("expected ',' or '}'");
        }
        return v;
    }

    Value parseArray() {
        Value v;
        v.type = Value::Type::Array;
        expect('[');
        if (peek() == ']') { ++pos_; return v; }
        while (true) {
            v.arr.push_back(parseValue());
            char c = peek();
            ++pos_;
            if (c == ']') break;
            if (c != ',') fail("expected ',' or ']'");
        }
        return v;
    }

    std::string parseString() {
        expect('"');
        std::string out;
        while (pos_ < s_.size()) {
            char c = s_[pos_++];
            if (c == '"') return out;
            if (c != '\\') { out += c; continue; }
            if (pos_ >= s_.size()) break;
            char e = s_[pos_++];
            switch (e) {
                case '"': out += '"'; break;
                case '\\': out += '\\'; break;
                case '/': out += '/'; break;
                case 'b': out += '\b'; break;
                case 'f': out += '\f'; break;
                case 'n': out += '\n'; break;
                case 'r': out += '\r'; break;
                case 't': out += '\t'; break;
                case 'u': {
                    // Data file is ASCII; keep \u escapes simple (BMP only, encoded as UTF-8).
                    if (pos_ + 4 > s_.size()) fail("bad \\u escape");
                    unsigned cp = std::stoul(s_.substr(pos_, 4), nullptr, 16);
                    pos_ += 4;
                    if (cp < 0x80) out += static_cast<char>(cp);
                    else if (cp < 0x800) {
                        out += static_cast<char>(0xC0 | (cp >> 6));
                        out += static_cast<char>(0x80 | (cp & 0x3F));
                    } else {
                        out += static_cast<char>(0xE0 | (cp >> 12));
                        out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F));
                        out += static_cast<char>(0x80 | (cp & 0x3F));
                    }
                    break;
                }
                default: fail("bad escape");
            }
        }
        fail("unterminated string");
    }

    Value parseNumber() {
        skipWs();
        const char* begin = s_.c_str() + pos_;
        char* end = nullptr;
        double d = std::strtod(begin, &end);
        if (end == begin) fail("unexpected character");
        pos_ += static_cast<size_t>(end - begin);
        Value v;
        v.type = Value::Type::Number;
        v.num = d;
        return v;
    }
};

inline Value parse(const std::string& text) { return Parser(text).parse(); }

}  // namespace json
