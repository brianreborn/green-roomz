/** Deterministic coding shapes for the Athlon fallback planner.
 *  A JSON-speaking model can ignore these and write anything in the jail. */

export const SHAPES = {
  add: {
    cliArgs: ['2', '3'],
    py: {
      lib: 'def add(a, b):\n    return a + b\n',
      test: 'from add import add\nassert add(2, 3) == 5\nprint("ok")\n',
      mainCall: 'print(add(2, 3))\n',
      cli: 'import sys\ndef add(a, b):\n    return a + b\nif __name__ == "__main__":\n    print(add(int(sys.argv[1]), int(sys.argv[2])))\n',
    },
    mjs: {
      lib: 'export function add(a, b) {\n  return a + b;\n}\n',
      test: 'import { add } from "./add.mjs";\nif (add(2, 3) !== 5) process.exit(1);\nconsole.log("ok");\n',
      mainCall: 'console.log(add(2, 3));\n',
      cli: 'export function add(a, b) { return a + b; }\nconst [a, b] = process.argv.slice(2).map(Number);\nconsole.log(add(a, b));\n',
    },
  },
  factorial: {
    py: {
      lib: 'def factorial(n):\n    return 1 if n <= 1 else n * factorial(n - 1)\n',
      test: 'from factorial import factorial\nassert factorial(5) == 120\nprint("ok")\n',
      mainCall: 'print(factorial(5))\n',
    },
    mjs: {
      lib: 'export function factorial(n) {\n  return n <= 1 ? 1 : n * factorial(n - 1);\n}\n',
      test: 'import { factorial } from "./factorial.mjs";\nif (factorial(5) !== 120) process.exit(1);\nconsole.log("ok");\n',
      mainCall: 'console.log(factorial(5));\n',
    },
  },
  fizzbuzz: {
    py: {
      lib: 'def fizzbuzz(n):\n    out = []\n    for i in range(1, n + 1):\n        if i % 15 == 0: out.append("FizzBuzz")\n        elif i % 3 == 0: out.append("Fizz")\n        elif i % 5 == 0: out.append("Buzz")\n        else: out.append(str(i))\n    return out\n',
      test: 'from fizzbuzz import fizzbuzz\nassert fizzbuzz(15)[-1] == "FizzBuzz"\nassert fizzbuzz(3)[2] == "Fizz"\nprint("ok")\n',
      mainCall: 'print("\\n".join(fizzbuzz(15)))\n',
    },
    mjs: {
      lib: 'export function fizzbuzz(n) {\n  const out = [];\n  for (let i = 1; i <= n; i += 1) {\n    out.push(i % 15 === 0 ? "FizzBuzz" : i % 3 === 0 ? "Fizz" : i % 5 === 0 ? "Buzz" : String(i));\n  }\n  return out;\n}\n',
      test: 'import { fizzbuzz } from "./fizzbuzz.mjs";\nif (fizzbuzz(15).at(-1) !== "FizzBuzz") process.exit(1);\nconsole.log("ok");\n',
      mainCall: 'console.log(fizzbuzz(15).join("\\n"));\n',
    },
  },
  palindrome: {
    py: {
      lib: 'def palindrome(s):\n    t = "".join(ch.lower() for ch in s if ch.isalnum())\n    return t == t[::-1]\n',
      test: 'from palindrome import palindrome\nassert palindrome("abba")\nassert not palindrome("xyz")\nprint("ok")\n',
      mainCall: 'print(palindrome("abba"))\n',
    },
    mjs: {
      lib: 'export function palindrome(s) {\n  const t = String(s).toLowerCase().replace(/[^a-z0-9]/g, "");\n  return t === [...t].reverse().join("");\n}\n',
      test: 'import { palindrome } from "./palindrome.mjs";\nif (!palindrome("abba") || palindrome("xyz")) process.exit(1);\nconsole.log("ok");\n',
      mainCall: 'console.log(palindrome("abba"));\n',
    },
  },
  reverse: {
    py: {
      lib: 'def reverse(s):\n    return s[::-1]\n',
      test: 'from reverse import reverse\nassert reverse("abc") == "cba"\nprint("ok")\n',
      mainCall: 'print(reverse("abc"))\n',
    },
    mjs: {
      lib: 'export function reverse(s) {\n  return [...String(s)].reverse().join("");\n}\n',
      test: 'import { reverse } from "./reverse.mjs";\nif (reverse("abc") !== "cba") process.exit(1);\nconsole.log("ok");\n',
      mainCall: 'console.log(reverse("abc"));\n',
    },
  },
  unique: {
    py: {
      lib: 'def unique(xs):\n    out = []\n    for x in xs:\n        if x not in out:\n            out.append(x)\n    return out\n',
      test: 'from unique import unique\nassert unique([1, 1, 2, 3, 2]) == [1, 2, 3]\nprint("ok")\n',
      mainCall: 'print(unique([1, 1, 2]))\n',
    },
    mjs: {
      lib: 'export function unique(xs) {\n  const out = [];\n  for (const x of xs) if (!out.includes(x)) out.push(x);\n  return out;\n}\n',
      test: 'import { unique } from "./unique.mjs";\nconst got = unique([1, 1, 2, 3, 2]);\nif (got.length !== 3 || got[0] !== 1 || got[2] !== 3) process.exit(1);\nconsole.log("ok");\n',
      mainCall: 'console.log(JSON.stringify(unique([1, 1, 2])));\n',
    },
  },
  wordcount: {
    py: {
      lib: 'def wordcount(s):\n    return len(s.split())\n',
      test: 'from wordcount import wordcount\nassert wordcount("one two three") == 3\nprint("ok")\n',
      mainCall: 'print(wordcount("one two three"))\n',
    },
    mjs: {
      lib: 'export function wordcount(s) {\n  return String(s).trim() ? String(s).trim().split(/\\s+/).length : 0;\n}\n',
      test: 'import { wordcount } from "./wordcount.mjs";\nif (wordcount("one two three") !== 3) process.exit(1);\nconsole.log("ok");\n',
      mainCall: 'console.log(wordcount("one two three"));\n',
    },
  },
  fibonacci: {
    py: {
      lib: 'def fibonacci(n):\n    a, b = 0, 1\n    for _ in range(n):\n        a, b = b, a + b\n    return a\n',
      test: 'from fibonacci import fibonacci\nassert fibonacci(10) == 55\nassert fibonacci(0) == 0\nprint("ok")\n',
      mainCall: 'print(fibonacci(10))\n',
    },
    mjs: {
      lib: 'export function fibonacci(n) {\n  let a = 0, b = 1;\n  for (let i = 0; i < n; i += 1) [a, b] = [b, a + b];\n  return a;\n}\n',
      test: 'import { fibonacci } from "./fibonacci.mjs";\nif (fibonacci(10) !== 55 || fibonacci(0) !== 0) process.exit(1);\nconsole.log("ok");\n',
      mainCall: 'console.log(fibonacci(10));\n',
    },
  },
  gcd: {
    py: {
      lib: 'def gcd(a, b):\n    while b:\n        a, b = b, a % b\n    return a\n',
      test: 'from gcd import gcd\nassert gcd(48, 18) == 6\nprint("ok")\n',
      mainCall: 'print(gcd(48, 18))\n',
    },
    mjs: {
      lib: 'export function gcd(a, b) {\n  while (b) [a, b] = [b, a % b];\n  return a;\n}\n',
      test: 'import { gcd } from "./gcd.mjs";\nif (gcd(48, 18) !== 6) process.exit(1);\nconsole.log("ok");\n',
      mainCall: 'console.log(gcd(48, 18));\n',
    },
  },
  iseven: {
    py: {
      lib: 'def iseven(n):\n    return n % 2 == 0\n',
      test: 'from iseven import iseven\nassert iseven(2) and not iseven(3)\nprint("ok")\n',
      mainCall: 'print(iseven(2))\n',
    },
    mjs: {
      lib: 'export function iseven(n) {\n  return n % 2 === 0;\n}\n',
      test: 'import { iseven } from "./iseven.mjs";\nif (!iseven(2) || iseven(3)) process.exit(1);\nconsole.log("ok");\n',
      mainCall: 'console.log(iseven(2));\n',
    },
  },
  jsonpick: {
    py: {
      lib: 'import json\ndef jsonpick(s, key="n"):\n    return json.loads(s)[key]\n',
      test: 'from jsonpick import jsonpick\nassert jsonpick(\'{"n": 7}\') == 7\nprint("ok")\n',
      mainCall: 'print(jsonpick(\'{"n": 7}\'))\n',
    },
    mjs: {
      lib: 'export function jsonpick(s, key = "n") {\n  return JSON.parse(s)[key];\n}\n',
      test: 'import { jsonpick } from "./jsonpick.mjs";\nif (jsonpick(\'{"n":7}\') !== 7) process.exit(1);\nconsole.log("ok");\n',
      mainCall: 'console.log(jsonpick(\'{"n":7}\'));\n',
    },
  },
};

const FN_KEYS = [
  ['fizzbuzz', 'fizzbuzz'],
  ['factorial', 'factorial'],
  ['palindrome', 'palindrome'],
  ['fibonacci', 'fibonacci'],
  ['wordcount', 'wordcount'],
  ['word count', 'wordcount'],
  ['jsonpick', 'jsonpick'],
  ['reverse', 'reverse'],
  ['unique', 'unique'],
  ['dedupe', 'unique'],
  ['deduplicate', 'unique'],
  ['iseven', 'iseven'],
  ['is even', 'iseven'],
  ['gcd', 'gcd'],
];

export function detectFn(goal) {
  const g = String(goal ?? '').toLowerCase();
  for (const [key, fn] of FN_KEYS) {
    if (g.includes(key)) return fn;
  }
  if (/\bjson\b/.test(g) && /\b(parse|pick|key)\b/.test(g)) return 'jsonpick';
  if (/\bcalculator\b/.test(g) || /\badd\s*\(/.test(g) || (/\badd\b/.test(g) && /\b(function|numbers|sum|cli|argv|test)\b/.test(g))) return 'add';
  return null;
}

export function dialectFor(ext) {
  if (ext === '.py') return 'py';
  if (ext === '.mjs' || ext === '.js' || ext === '.cjs') return 'mjs';
  return null;
}

export function shapeFor(fn, ext) {
  const row = SHAPES[fn];
  if (!row) return null;
  const d = dialectFor(ext);
  return d ? row[d] ?? null : null;
}
