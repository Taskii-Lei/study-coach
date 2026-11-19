const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../web/editor.js');
function apply(value, key, options={}) {
 const start=options.start??value.length,end=options.end??start;
 const result=E.edit(value,start,end,key,!!options.shift,options.python!==false);
 if(!result)return null;
 return {...result,value:value.slice(0,result.from)+result.text+value.slice(result.to)};
}
test('Enter indents Python blocks, including a trailing comment',()=>{
 assert.equal(apply('def solve():','Enter').value,'def solve():\n    ');
 assert.equal(apply('    if ready: # continue','Enter').value,'    if ready: # continue\n        ');
 assert.equal(apply('    total += value','Enter').value,'    total += value\n    ');
});
test('colons in strings and comments do not add a block indent',()=>{
 assert.equal(apply('    # note:','Enter').value,'    # note:\n    ');
 assert.equal(apply('    print("#") # note:','Enter').value,'    print("#") # note:\n    ');
 assert.equal(apply('    label = "a:"','Enter').value,'    label = "a:"\n    ');
});
test('Enter replaces the selection and positions the caret after indentation',()=>{
 const r=apply('if ready:replace','Enter',{start:9,end:16});
 assert.equal(r.value,'if ready:\n    ');assert.equal(r.start,r.value.length);assert.equal(r.end,r.start);
});
test('Tab uses four-column stops; Shift+Tab removes indentation',()=>{
 assert.equal(apply('  ','Tab').value,'    ');
 assert.equal(apply('    return x','Tab',{shift:true}).value,'return x');
 assert.equal(apply('  return x','Tab',{shift:true}).value,'return x');
 assert.equal(apply('\treturn x','Tab',{shift:true}).value,'return x');
});
test('Tab and Shift+Tab transform a selected block without changing the next line',()=>{
 const source='a\nb\nc';
 const indented=apply(source,'Tab',{start:0,end:4});
 assert.equal(indented.value,'    a\n    b\nc');
 const out=apply(indented.value,'Tab',{start:indented.start,end:indented.end,shift:true});
 assert.equal(out.value,source);
});
test('non-Python prose uses native Enter; empty input still supports Enter and Tab',()=>{
 assert.equal(apply('原理：','Enter',{python:false}),null);
 assert.equal(apply('','Enter').value,'\n');assert.equal(apply('','Tab').value,'    ');
});
