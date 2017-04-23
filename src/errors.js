class ChinoException extends Error {
  constructor(message, location = null) {
    super(message);
    this.location = location;
    this.name = 'ChinoException';

    if (location) {
      var l = this.location.start;
      this.message = `${message} @ column: ${l.column}, line: ${l.line}`;
    }
  }
}

module.exports = {
  ChinoException: ChinoException,
  ValueTypeError: class extends ChinoException {},
  VariableError: class extends ChinoException {},
  TypeError: class extends ChinoException {},
  ArrayRangeError: class extends ChinoException {},
}
