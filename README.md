ChinoScript
====

> Ah＾～ It makes my heart keep hopping＾～

ChinoScript is a programming language like C language. It was developed for [CodeColosseum](https://trapti.tech/works/1803/).

Its features are

* friendly embedding for JavaScript (see `bin/chino`)
* C like symtax
* basic types(int, char, bool, array, tuple, function)
* generic typed function
* eternal variable
    * An eternal variable is keeped even if program is finished.

# Build

```
$ npm i
$ npm run build

$ npm run watch-build # build when file changed
```

# Usage

```
$ bin/chino FILE
```

# Test

```
$ npm test
```

# Example

```c
int i = 0;

while(i < 5) {
  puts("pyonpyon");
  i += 1;
}
```

```c
for (int i = 1; i < 100; i += 1) {
  if (i % 15 == 0) { puts("FizzBuzz"); }
  else if (i % 3 == 0) { puts("Fizz"); }
  else if (i % 5 == 0) { puts("Buzz"); }
  else { puts(i); }
}
```

```c
int[] ary1 = int[]{1, 2, 3};

ary1[2] = 2;
ary1[114514] = 2; # out of range error

puts(len(ary1)); # => 3

append(ary1, 10);
puts(len(ary1)); # => 4

delete(ary1, 0);
puts(len(ary1)); # => 3

for (int i = 0; i < len(ary1); i += 1) {
  puts(ary1[i]);
}
```

```c
bool eq<A>(A x, A y) {
  return x == y;
}

puts(eq(1, 1));
puts(eq(1, "A")); # type error
```

for more examples, see `/examples`

# License

MIT
