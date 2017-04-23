var Errors = require('./errors.js');

class Value {
  constructor(value, type, location) {
    this.value = value;
    this.type = type;
    this.location = location;
  }

  toString() {
    return this.value.toString();
  }
}

class Type {
  constructor(name, innerTypes = []) {
    this.name = name;
    this.innerTypes = innerTypes;
  }

  isMatch(vtype, genericTypes = {}) {
    if (genericTypes.hasOwnProperty(this.name)) {
      if (genericTypes[this.name] === null) {
        genericTypes[this.name] = vtype;
      }
    }

    var outerMatched;
    if (genericTypes.hasOwnProperty(this.name)) {
      outerMatched = genericTypes[this.name].name === vtype.name;
    } else {
      outerMatched = this.name === vtype.name;
    }

    if (outerMatched) {
      if (this.innerTypes.length === 0) {
        return true;
      } else if (this.innerTypes.length === vtype.innerTypes.length){
        return this.innerTypes.every((t, i) => t.isMatch(vtype.innerTypes[i], genericTypes));
      } else {
        return false;
      }
    } else {
      return false;
    }
  }

  replaceGenericTypes(genericTypes) {
    var newType;
    if (genericTypes.hasOwnProperty(this.name)) {
      var r = genericTypes[this.name]
      newType = new Type(r.name);
    } else {
      newType = new Type(this.name);
    }
    newType.innerTypes = this.innerTypes.map((t) => t.replaceGenericTypes(genericTypes));

    return newType;
  }

  toString() {
    if (this.innerTypes.length > 0) {
      return `${this.name}[${this.innerTypes.map((v) => v.toString()).join(", ")}]`;
    } else {
      return this.name;
    }
  }
}

const Values = {
  Value: Value,
  // for internal use
  Identifier: class extends Value {
    constructor(value, location) {
      super(value, null, location);
    }
  },

  Integer: class extends Value {
    constructor(value) {
      if (typeof(value) !== 'number' || isNaN(value)) {
        throw new Errors.ValueTypeError(`${value} is not integer`);
      }
      // TODO: intにする
      super(Math.floor(value), new Type('Integer'));
    }
  },
  Char: class extends Value {
    constructor(value) {
      if (typeof(value) !== 'string' || value.length !== 1) {
        throw new Errors.ValueTypeError(`${value} is not char(string with one length)`);
      }

      super(value, new Type('Char'));
    }

    toString() {
      return `'${this.value}'`
    }
  },
  Boolean: class extends Value {
    constructor(value) {
      if (typeof(value) !== 'boolean') {
        throw new Errors.ValueTypeError(`${value} is not boolean`);
      }

      super(value, new Type('Boolean'));
    }
  },
  Array: class extends Value {
    constructor(values, innerType) {
      super(values, new Type('Array', [innerType]));
    }

    validateIndex(index) {
      if (index < 0 || this.value.length <= index) {
        throw new Errors.ArrayRangeError(`out of range: ${index}`);
      }
    }

    toString() {
      if (this.type.innerTypes[0].name === 'Char') {
        return `"${this.value.map((c) => c.value ).join('')}"`;
      } else {
        return `[${this.value.map((v) => v.toString()).join(", ")}]`;
      }
    }
  },
  Tuple: class extends Value {
    constructor(values, innerTypes) {
      super(values, new Type('Tuple', innerTypes));
    }

    toString() {
      return `Tuple(${this.value.map((v) => v.toString()).join(", ")})`
    }
  },
  Function: class extends Value {
    constructor(value, resultType, argTypes, genericTypes, isNative, argsDecl = []) {
      if (isNative) {
        if (typeof(value) !== 'function') {
          throw new Errors.ValueTypeError(`${value} is not function`);
        }
      } else {
        if (Object.prototype.toString.call(value) !== '[object Object]') {
          throw new Errors.ValueTypeError(`${value} is not AST object`);
        }
      }
      super(value, new Type('Function', [resultType].concat(argTypes)));

      this.resultType = resultType;
      this.argTypes = argTypes;
      this.genericTypes = genericTypes;
      this.isNative = isNative;

      this.argsDecl = argsDecl;
    }
  },

  Type: Type,
};

module.exports = Values;
