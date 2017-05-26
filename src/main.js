var parser = require('./grammer.js');
export var Errors = require('./errors.js');
export var Values = require('./values.js');

require("babel-core/register");
require("babel-polyfill");

export function evaluate(code, evaluator = new Evaluator(), showAST = false) {
  var ast;
  try {
    ast = parser.parse(code);
  } catch (e) {
    if (e instanceof parser.SyntaxError) {
      throw new Errors.ChinoException(e.message, e.location);
    }

    throw e;
  }

  if (showAST) {
    // for debug
    console.log(require('util').inspect(ast, true, 10));
  }

  const vmcode = (new Compiler()).compile(ast);
  console.log(require('util').inspect(vmcode, true, 10));

  // evaluator.push_env();
  // var retVal = evaluator.eval_stmts(ast);
  // evaluator.pop_env();
  //
  // return retVal;
}

export function return_(value) {
  throw new NonLocalExits(value);
}

export var Shortcuts = {
  id: (val) => new Values.Identifier(val),
  type: (name, innerTypes = []) => new Values.Type(name, innerTypes),
  int: (val) => new Values.Integer(val),
  unit: new Values.Tuple([], []),
  define_fun (evaluator, resultType, argTypes, name, value, gt = []) {
    var genericTypes = gt.map((t) => this.id(t));
    evaluator.consts.add(
        this.type('Function', [resultType].concat(argTypes)),
        this.id(name),
        new Values.Function(value, resultType, argTypes, genericTypes, true));
  }
}

class NonLocalExits {
  // value is used as return value
  constructor(value) {
    this.value = value || null;
  }
}

class Variable {
  constructor(type, name) {
    this.type = type;
    this.name = name;

    this.value = null;
  }

  set(value, location = null) {
    // type check
    if (!this.type.isMatch(value.type)) {
      throw new Errors.TypeError(`type missmatch '${value.type}' to '${this.type}'`, location);
    }

    this.value = value;
  }
}

class Environment {
  constructor(eternals, consts, parent) {
    // key: string, value: Value
    this.locals = {};

    this.eternals = eternals;
    this.consts = consts;
    this.parent = parent;
  }

  level() {
    if (!this.parent) {
      return 0;
    } else {
      return this.parent.level() + 1;
    }
  }

  add(type, name, initialValue = null) {
    if (this.locals.hasOwnProperty(name.value)) {
      throw new Errors.VariableError(`'${name.value}' has already defined`, name.location);
    }

    var v = new Variable(type, name.value);
    this.locals[name.value] = v;

    if (initialValue !== null) {
      v.set(initialValue);
    }

    return v;
  }

  set(name, value) {
    if (this.locals.hasOwnProperty(name.value)) {
      this.locals[name.value].set(value);
    } else {
      if (!this.parent) {
        throw new Errors.VariableError(`undefined local variable '${name.value}'`, name.location);
      }
      this.parent.set(name, value);
    }
  }

  get(name) {
    return this.getVariable(name).value;
  }

  getVariable(name) {
    var v = this._getVariable(name);
    if(v === null) {
      throw new Errors.VariableError(`undefined local variable or const '${name.value}'`, name.location);
    }
    return v;
  }

  // it returns null when variable is not fount
  _getVariable(name) {
    if (this.locals.hasOwnProperty(name.value)) {
      return this.locals[name.value];
    } else {
      var parentVal;
      if (this.parent && (parentVal = this.parent._getVariable(name)) !== null) {
        return parentVal;
      } else {

        var eternalVal;
        if(this.eternals && (eternalVal = this.eternals._getVariable(name)) !== null) {
          return eternalVal;
        } else {

          var constVal;
          if(this.consts && (constVal = this.consts._getVariable(name)) !== null) {
            return constVal;
          } else {
            return null;
          }
        }
      }
    }
  }
}

class Compiler {
  constructor() {
    this.code = [];
    this.label_count = 0;
  }

  compile(ast) {
    const funcs = ast
      .filter((node) => node.type === 'def_fun')
      .map((node) => this.compile_func(node));
    const topLevel = {
      type: 'def_fun',
      out_type: Shortcuts.unit,
      name: Shortcuts.id('$main'),
      args: [],
      block: {
        type: 'block',
        stmts: ast.filter((node) => node.type !== 'def_fun')
      },
    }
    funcs.push(this.compile_func(topLevel));

    return funcs;
  }

  compile_func(node) {
    const new_node = Object.assign({}, node);

    this.code = [];
    this.compile_block(node.block);
    delete new_node.block;

    new_node.code = this.code;

    return new_node
  }

  compile_block(node) {
    node.stmts.forEach((stmt) => this.compile_stmt(stmt));
  }

  compile_stmt(stmt) {
    if (stmt === null) return;

    switch(stmt.type) {
      case 'if_stmt':
        this.compile_expr(stmt.condition);
        const elseLabel = this.create_label();
        this.add_op({ type: 'jump_if_not', dest: elseLabel });

        this.compile_block(stmt.iftrue);
        this.add_op(elseLabel);

        this.compile_block(stmt.iffalse);

        return;

      case 'while_stmt':
        const headLabel = this.create_label();
        this.add_op(headLabel);

        this.compile_expr(stmt.condition);
        const tailLabel = this.create_label();
        this.add_op({ type: 'jump_if_not', dest: tailLabel });

        this.compile_block(stmt.block);
        this.add_op({ type: 'jump', dest: headLabel });

        this.add_op(tailLabel);

        return;

      case 'for_stmt':
        // TODO: implement
        return;

      case 'return_stmt':
        this.compile_expr(stmt.value);
        this.add_op({ type: 'return' });
        return;

      case 'def_var':
        this.compile_expr(stmt.init_value);
        const op = Object.assign({}, stmt)
        delete op.init_value;
        this.add_op(op);
        return;

      default:
        this.compile_expr(stmt);
    }
  }

  compile_expr(expr) {
    switch(expr.type) {
      case 'binary_op':
        this.compile_expr(expr.left);
        this.compile_expr(expr.right);
        this.add_op({ type: 'binary_op', op: expr.op, left_indexed: expr.left_indexed })

        return;

      case 'unary_op_f':
        this.compile_expr(expr.right);
        this.add_op({ type: 'unary_op_f', op: expr.op })
        return;

      case 'call_function':
        expr.args.forEach((arg) => this.compile_expr(arg));
        this.add_op({ type: 'call_function', name: expr.name })
        return;

      case 'lh_expression':
        if (expr.index) {
          this.compile_expr(expr.index);
        }
        this.add_op({ type: 'eval', expr: expr });
        return;

      case 'array_literal':
        expr.values.forEach((value) => this.compile_expr(value));
        this.add_op({ type: 'array_literal', innerType: expr.innerType });
        return;

      default:
        this.add_op({ type: 'eval', expr: expr });
        return;
    }
  }

  create_label() {
    const label = { type: 'label', id: this.label_count };
    this.label_count++;
    return label;
  }

  add_op(op) {
    this.code.push(op);
  }
}

export class Evaluator {
  constructor() {
    this.consts = new Environment(null, null, null);
    this.eternals = new Environment(null, null, null);
    this.currentEnv = this.rootEnv = new Environment(this.eternals, this.consts, null);

    // define basic functions
    var s = Shortcuts;
    s.define_fun(this, s.type('Tuple', []), [s.type('A')], 'puts', function (value) {
      console.log(value.toString());
      return s.unit;
    }, ['A']);

    var arrayType = s.type('Array', [s.type('A')]);
    s.define_fun(this, arrayType, [arrayType, s.type('A')], 'append', function (ary, value) {
      ary.value.push(value);
      return ary;
    }, ['A']);

    s.define_fun(this, arrayType, [arrayType, s.type('Integer')], 'delete', function (ary, index) {
      ary.validateIndex(index.value);
      ary.value.splice(index.value, 1);
      return ary;
    }, ['A']);

    s.define_fun(this, s.type('Integer'), [arrayType], 'len', function (ary) {
      return new Values.Integer(ary.value.length);
    }, ['A']);

    s.define_fun(this, s.type('Integer'), [s.type('Char')], 'ctoi', function(value) {
      return s.int(value.value.charCodeAt(0));
    });
  }

  push_env() {
    this.currentEnv = new Environment(this.eternals, this.consts, this.currentEnv);
  }

  pop_env() {
    this.currentEnv = this.currentEnv.parent;
  }

  eval_stmts(stmts) {
    for(var i = 0 ; i < stmts.length ; i++) {
      var stmt = stmts[i];

      try {
        this.eval_stmt(stmt);
      } catch (e) {
        if (e instanceof NonLocalExits) {
          return e.value;
        }

        throw e;
      }
    }

    return Shortcuts.unit;
  }

  eval_block(block) {
    this.push_env();

    var stmts = block.stmts;
    for(var i = 0 ; i < stmts.length ; i++) {
      try {
        this.eval_stmt(stmts[i]);
      } catch (e) {
        if (e instanceof NonLocalExits) {
          this.pop_env();
        }

        throw e;
      }
    }

    this.pop_env();
  }

  eval_stmt(stmt) {
    if (stmt === null) return;

    switch(stmt.type) {
      case 'def_var':
        var init_value = this.eval_stmt(stmt.init_value);

        if (stmt.eternal) {
          if (this.currentEnv.level() !== 1) {
            throw new Errors.VariableError('eternal variable can be only defined at top level')
          }

          // TODO: もともとevaluatorにあったものと同スクリプト内ですでに定義されていた場合を区別する
          // 現状では2度eternal変数を定義してもエラーが出ない
          if (this.eternals._getVariable(stmt.name) === null) {
            this.eternals.add(stmt.var_type, stmt.name, init_value);
          }
        } else {
          this.currentEnv.add(stmt.var_type, stmt.name, init_value);
        }
        break;
      case 'def_fun':
        var argTypes = stmt.args.map((arg) => arg.var_type);
        var ftype = new Values.Type('Function', [stmt.out_type].concat(argTypes));
        var value = new Values.Function(stmt.block, stmt.out_type, argTypes, stmt.genericTypes, false, stmt.args);
        this.currentEnv.add(ftype, stmt.name, value);

        break;
      case 'if_stmt':
        if(this.eval_expr(stmt.condition).value === true) {
          this.eval_block(stmt.iftrue);
        } else {
          if (stmt.iffalse) {
            this.eval_block(stmt.iffalse);
          }
        }
        break;
      case 'while_stmt':
        while(this.eval_expr(stmt.condition).value === true) {
          this.eval_block(stmt.block);
        }
        break;
      case 'for_stmt':
        this.push_env();

        this.eval_stmt(stmt.init);

        try {
          var block = [].concat(stmt.block.stmts);
          block.push(stmt.update);

          while(this.eval_expr(stmt.condition).value === true) {
            this.eval_block({ stmts: block });
          }
        } catch (e) {
          throw e;
        } finally {
          this.pop_env();
        }

        break;
      case 'return_stmt':
        if (stmt.value) {
          var retVal = this.eval_expr(stmt.value);
          throw new NonLocalExits(retVal);
        } else {
          throw new NonLocalExits();
        }
      default:
        return this.eval_expr(stmt);
    }
  }

  eval_expr(expr) {
    if (expr instanceof Values.Value) return expr;

    switch(expr.type) {
      case 'binary_op':
        // assign
        if (expr.op === '=') {
          var right = this.eval_expr(expr.right);
          var target = this.currentEnv.getVariable(expr.left.name);

          if (expr.left.index) {
            var index = this.eval_expr(expr.left.index);
            // TODO: fix
            if (!(new Values.Type('Integer')).isMatch(index.type)) {
              throw new Errors.TypeError(`${index} must be Integer`, expr.location);
            }
            if (!(new Values.Type('Array')).isMatch(target.type)) {
              throw new Errors.TypeError(`${expr.left.name} must be Array`, expr.location);
            }

            if (!target.type.innerTypes[0].isMatch(right.type)) {
              throw new Errors.TypeError(`type missmatch ${right.type} to ${target.type.innerTypes[0]}`, expr.location);
            }

            var indexv = index.value;
            target.value.validateIndex(indexv);
            target.value.value[index.value] = right;
          } else {
            target.set(right, expr.location);
          }

          return right;
        } else {
          return this.eval_binary_op(expr);
        }
      case 'unary_op_b':
        throw new Errors.ChinoException('Bug');
      case 'unary_op_f':
        return this.eval_unary_op(expr);
      case 'ref_var':
        if (expr.index) {
          var index = this.eval_expr(expr.index);
          var target = this.currentEnv.getVariable(expr.value);
          // TODO: fix
          if (!(new Values.Type('Integer')).isMatch(index.type)) {
            throw Errors.TypeError(`${index} must be Integer`);
          }
          if (!(new Values.Type('Array')).isMatch(target.type)) {
            throw Errors.TypeError(`${expr.left.name} must be Array`);
          }

          var indexv = index.value;
          target.value.validateIndex(indexv);
          return target.value.value[index.value];
        } else {
          return this.currentEnv.get(expr.value);
        }
      case 'call_function':
        var name = this.eval_expr(expr.name);
        var args = expr.args.map((arg) => this.eval_expr(arg));

        var fun = this.currentEnv.get(name);
        // TODO: 関数であることの型チェック

        try {
          this.push_env();

          var genericTypes = {};
          fun.genericTypes.forEach((name) => genericTypes[name] = null);

          for (var i = 0; i < fun.argTypes.length; i++) {
            var at = fun.argTypes[i];

            var typeName = new Values.Identifier(at.name);
            if (!at.isMatch(args[i].type, genericTypes)) {
              throw new Errors.TypeError(`${args[i]} must be ${at}`, args[i].location);
            }
          }

          var result;
          if (fun.isNative) {
            result = fun.value.apply(null, args);
          } else {
            fun.argsDecl.forEach((arg, i) => {
              var type = arg.var_type.replaceGenericTypes(genericTypes);
              this.currentEnv.add(type, arg.value, args[i]);
            });
            result = this.eval_stmts(fun.value.stmts);
          }

          if (!(result instanceof Values.Value)) {
            throw new Errors.ChinoException(`Bug: result of ${name.value}: ${result} is not Value`);
          }

          var resultType = fun.resultType.replaceGenericTypes(genericTypes);
          if (!resultType.isMatch(result.type)) {
            throw new Errors.TypeError(`the result ${result} must be ${fun.resultType}`, expr.location);
          }

        } finally {
          this.pop_env();
        }

        return result;
      case 'array_literal':
        var values = expr.values.map((v) => this.eval_expr(v));

        for (var i = 0; i < values.length; i++) {
          if (!expr.innerType.isMatch(values[i].type)) {
            throw new Errors.TypeError(`type missmatch ${expr.values[i]} of ${expr.innerType} array`, expr.values[i].location);
          }
        }

        return new Values.Array(values, expr.innerType);
      default:
        throw `unknown expr ${JSON.stringify(expr)}`
    }
  }

  eval_binary_op(expr) {
    if (expr.op === '&&') {
      var left = this.eval_expr(expr.left);
      if (left.value) {
        var right = this.eval_expr(expr.right);
        return right;
      }
      return new Values.Boolean(false);
    } else if (expr.op === '||') {
      var left = this.eval_expr(expr.left);
      if (!left.value) {
        var right = this.eval_expr(expr.right);
        return right;
      }
      return new Values.Boolean(true);
    }

    var left = this.eval_expr(expr.left);
    var right = this.eval_expr(expr.right);

    switch(expr.op) {
      // TODO: 型チェック
      case '>': return new Values.Boolean(left.value > right.value);
      case '<': return new Values.Boolean(left.value < right.value);
      case '==': return new Values.Boolean(left.value === right.value);
      case '>=': return new Values.Boolean(left.value >= right.value);
      case '<=': return new Values.Boolean(left.value <= right.value);
      case '!=': return new Values.Boolean(left.value !== right.value);

      case '+': return new Values.Integer(left.value + right.value);
      case '-': return new Values.Integer(left.value - right.value);
      case '*': return new Values.Integer(left.value * right.value);
      case '/': return new Values.Integer(left.value / right.value);
      case '%': return new Values.Integer(left.value % right.value);

      default: throw `unknown op '${expr.op}'`
    }
  }

  eval_unary_op(expr) {
    var right = this.eval_expr(expr.right);

    switch(expr.op) {
      case '+': return right; // nothing to do
      case '-': return new Values.Integer(-right.value);
    }
  }
}
