const { parseCsv } = require('./parser');

function assertEqual(actual, expected, name) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  console.log(`${a === e ? 'PASS' : 'FAIL'}: ${name}\n  got=${a}\n  expected=${e}`);
  if (a !== e) process.exit(1);
}

assertEqual(parseCsv('name,age\nAlice,30\nBob,25'), [{name:'Alice',age:30},{name:'Bob',age:25}], 'basic parse + numeric coercion');
assertEqual(parseCsv(''), [], 'empty input');
assertEqual(parseCsv('a,b\nx,y\n\n'), [{a:'x',b:'y'}], 'trailing newline ignored + skipEmpty default');
assertEqual(parseCsv('a,b\n"hello, world","x"'), [{a:'hello, world',b:'x'}], 'quoted field with comma');
assertEqual(parseCsv('a,b\n"qq ""inside"" qq",y'), [{a:'qq "inside" qq',b:'y'}], 'escaped quotes');
assertEqual(parseCsv('a,b\n  x  ,  y  ', { trim: true }), [{a:'x',b:'y'}], 'opts.trim');
assertEqual(parseCsv('a,b\n1.5,-3'), [{a:1.5,b:-3}], 'float and negative numbers');
assertEqual(parseCsv('a,b\n,,'), [], 'all-empty rows skipped by default');

console.log('ALL TESTS PASSED');
