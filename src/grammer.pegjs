{
  var Values = require('./values.js');

  const RESERVED_WORDS = ["return", "int", "string", "char", "void", "for", "while", "if"];

  function node(type, value) {
    return { type: type, value: value };
  }

  function if_stmt(condition, iftrue, iffalse) {
    var ret = { type: "if_stmt", condition: condition, iftrue: iftrue };
    if(iffalse !== null) ret['iffalse'] = iffalse[3];
    return ret;
  }

  function block(stmts) {
    return { type: "block", stmts: filter(flatten(stmts), [" ", "\n", ";"]) };
  }

  function unary_op_b(op, right) {
    return { type: "unary_op_b", op: op, right: right};
  }

  function unary_op_f(op, right) {
    return { type: "unary_op_f", op: op, right: right};
  }

  function binary_op(left, rest) {
    left = flatten([left]);
    rest = filter(flatten(rest), [" "]);

    var binary_op_intr = function(nodes) {
      var right = nodes.pop();
      var op    = nodes.pop();
      var left;
      if (nodes.length == 1) {
        left = nodes[0];
      }
      else {
        left = binary_op_intr(nodes);
      }
      return { type: "binary_op", left: left, op: op, right: right, location: location() };
    }
    return binary_op_intr(left.concat(rest));
  }

  function combined_binary_op(left, rest) {
    var op = rest[1].charAt(0);
    var right_ref = { type: "ref_var", value: left.name };
    if (left.index) right_ref.index = left.index;

    var right = { type: "binary_op", left: right_ref, op: op, right: rest[3] };

    return { type: "binary_op", left: left, op: "=", right: right };
  }

  function def_fun(type, name, generic_types, fst_arg, rest_args, block) {
    generic_types = filter(flatten(generic_types || []), [' ', ',']);
    generic_types.shift();
    generic_types.pop();
    return { type: "def_fun", out_type:type, name: name, args: mkargs(fst_arg, rest_args), block: block, genericTypes: generic_types };
  }

  function def_var(eternal, type, name, length, init_value) {
    var node = { eternal: eternal !== null, type: "def_var", var_type: type, name: name };
    if(length !== null) {
      node.length = length[1];
    }
    node.init_value = init_value[2];
    return node;
  }

  function ref_var(id, index) {
    var node = { type: "ref_var", value: id };
    if(index !== null) {
      node.index = index[3];
    }
    return node;
  }

  function is_array(obj) {
    return Object.prototype.toString.call(obj) === "[object Array]";
  }

  function mkargs(fst_arg, rest_args) {
    if(fst_arg === null) return [];
    else { return filter(flatten([fst_arg].concat(rest_args)), [',', ' ']); }
  }

  function mktype(id, ary) {
    // FIXME: どうにかしたい
    var typeTable = {
      'int': 'Integer', 'bool': 'Boolean', 'char': 'Char'
    };

    var typeName;

    if(typeTable.hasOwnProperty(id.value)) {
      typeName = typeTable[id.value];
    } else {
      typeName = id.value;
    }

    if (ary.length > 0) {
      return new Values.Type('Array', [new Values.Type(typeName)]);
    } else if (id.value === 'void') {
      return new Values.Type('Tuple', []);
    } else if (id.value === 'string') {
      return new Values.Type('Array', [new Values.Type('Char')]);
    } else {
      return new Values.Type(typeName);
    }
  }

  function mklh_expression(id, index) {
    if (index) {
      return { type: "lh_expression", name: id, index: index[3] };
    } else {
      return { type: "lh_expression", name: id };
    }
  }

  function mkarray(type, fst_value, rest_values) {
    var values = [];

    if (fst_value) values.push(fst_value);
    rest_values.forEach(function(v){
      values.push(v[3]);
    });

    return { type: "array_literal", innerType: type.innerTypes[0], values: values };
  }

  function flatten(ary) {
    if(!is_array(ary)) {
      return ary;
    }
    else {
      return Array.prototype.concat.apply([], ary.map(flatten));
    }
  }

  function filter(ary, pattern) {
    return ary.filter(function(e) {
      if(is_array(e) && e.length == 0) return false;
      if(pattern.indexOf(e) !== -1) return false;
      return true;
    });
  }
}

program
  = program:(top_statement _ )*
    { return filter(flatten(program), ["\n", " ", null]); }

top_statement
  = def_fun
  / statement _ comment?
  / comment

statement
  = def_var
  / if_stmt
  / while_stmt
  / for_stmt
  / return_stmt
  / expr:expression _ ";" { return expr; }

def_fun
  = type:type _ name:identifier _ generic_types:( "<" identifier _ :("," _ identifier _)* ">" )? _ "(" _  fst_arg:def_arg? rest_args:(_ "," _ def_arg)* _ ")" _ block:block
    { return def_fun(type, name, generic_types, fst_arg, rest_args, block);  }

def_var
  = eternal:("eternal" / "†eternal†")? _ type:type _ name:identifier _ length:("[" integer "]")? _ init_value:("=" _  expression) _ ";"
    { return def_var(eternal, type, name, length, init_value); }

if_stmt
  = "if" _ "(" _ cond:expression _ ")" _ iftrue:block iffalse:(_ "else" _ block)?
    { return if_stmt(cond, iftrue, iffalse); }

while_stmt
  = "while" _ "(" _ cond:expression _ ")" _ block:block
    { return { type: "while_stmt", condition: cond, block: block }; }

for_stmt
  = "for" _ "(" _ init:(def_var / expression _ ";")  _ cond:expression _ ";" _ update:expression _ ")" _ block:block
    { return { type: "for_stmt", init: init, condition: cond, update: update, block: block }; }

return_stmt
  = "return" _ value:expression? _ ";"
    { return { type: "return_stmt", value: value }; }

expression
  = left:lh_expression rest:(_ "=" _ term0)+
    { return binary_op(left, rest); }
  / left:lh_expression rest:(_ ("+=" / "-=" / "*=" / "/=" / "%=") _ term0)
    { return combined_binary_op(left, rest); }
  / term:term0
    {
      term = flatten(term);
      if(is_array(term)) {
        term[0].location = location();
        return term[0];
      } else {
        term.location = location();
        return term;
      }
    }

lh_expression
  = id:identifier index:(_ "[" _ expression _ "]" _)?
    { return mklh_expression(id, index); }

term0
  = left:term1 rest:(_ "||" _ term1)+
    { return binary_op(left, rest); }
  / term1

term1
  = left:term2 rest:(_ "&&" _ term2)+
    { return binary_op(left, rest); }
  / term2

term2
  = left:term3 rest:(_ ("<=" / ">=" / "<" / ">" / "==" / "!=") _ term3)+
    { return binary_op(left, rest); }
  / term3

term3
  = left:term4 rest:(_ ("+" / "-") _ term4)+
    { return binary_op(left, rest); }
  / term4

term4
  = left:unary rest:(_ ("*" / "/" / "%") _ unary)+
    { return binary_op(left, rest); }
  / unary


unary
  = op:("-" / "+") _ val:factor { return unary_op_f(op, val); }
  / factor

factor
  = "(" _ expr:expression _ ")"
    { return expr; }
  / name:identifier _ "(" _ fst_arg:expression? rest_args:(_ "," _ expression)* _ ")"
    { return { type: "call_function", name: name, args: mkargs(fst_arg, rest_args) }; }
  / integer
  / string
  / char
  / boolean
  / id:identifier index:(_ "[" _ expression _ "]" _)?
    { return ref_var(id, index); }
  / array

integer "integer"
  = [0-9]+
    { return new Values.Integer(parseInt(text(), 10)); }

string
  // TODO: エスケープ周りを修正
  = "\"" value:([^"]*) "\""
    { return { type: "array_literal", innerType: new Values.Type('Char'), values: value.map(function(c) { return new Values.Char(c) }) }; }

char
  = "'" value:. "'"
    { return new Values.Char(value); }

boolean
  = value:("true" / "false")
    { return new Values.Boolean(value === 'true'); }

array
= _ type:array_type _ "{" _ fst_value:expression? values:(_ "," _ expression)* _ "}"
    { return mkarray(type, fst_value, values); }

block
  = "{" _ comment? _ stmts:(statement _ comment? / comment) * _ "}"
    { return block(stmts); }
  / stmt:statement
    { return block([stmt]); }

def_arg
  = type:type _ name:identifier
    { return { type: "def_arg", var_type: type, value: name }; }

type
  = id:type_identifier ary:(_ "[" "]")*
    & { return ["return"].indexOf(id.value) === -1; }
    { return mktype(id, ary); }

array_type
  = id:type_identifier ary:(_ "[" "]")+
    & { return ["return"].indexOf(id.value) === -1; }
    { return mktype(id, ary); }

type_identifier
  = content:([a-zA-Z_][a-zA-Z_0-9]*)
    & { return ["return"].indexOf(content[0] + content[1].join("")) === -1; }
    { return new Values.Identifier(text(), location()); }

identifier
  = content:([a-zA-Z_][a-zA-Z_0-9]*)
    & { return RESERVED_WORDS.indexOf(content[0] + content[1].join("")) === -1; }
    { return new Values.Identifier(text(), location()); }

comment
  = "#" [^\n\r]* _ { return null; }

_ "whitespace"
  = [ \t\n\r]*
