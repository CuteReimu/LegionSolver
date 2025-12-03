"use strict";

class Kissat {
  constructor() {
    this.solverPtr = undefined;
    this.init();
  }

  init() {
    this.release();
    this.solverPtr = Module.ccall("kissat_init", "number", [], []);
    console.log(`[Kissat.init] ${this.solverPtr}`);
  }

  initBasic() {
    this.init();
    this.setConfiguration("basic");
  }

  initPlain() {
    this.init();
    this.setConfiguration("plain");
  }

  initSat() {
    this.init();
    this.setConfiguration("sat");
  }

  initUnsat() {
    this.init();
    this.setConfiguration("unsat");
  }

  release() {
    if (typeof this.solverPtr !== "undefined") {
      console.log(`[Kissat.release] ${this.solverPtr}`);
      Module.ccall("kissat_release", null, ["number"], [this.solverPtr]);
    }
    this.solverPtr = undefined;
  }

  /**
   * @return {string}
   */
  signature() {
    return Module.ccall("kissat_signature", "string", [], []);
  }

  /**
   * @param {number} litOrZero
   */
  add(litOrZero) {
    Module.ccall("kissat_add", null, ["number", "number"], [this.solverPtr, litOrZero]);
  }

  /**
   * @param {number[]} clause
   */
  addClause(clause) {
    for (const lit of clause) {
      this.add(lit);
    }
    this.add(0);
  }

  /**
   * @return {boolean} true: SAT, false: UNSAT, undefined: UNKNOWN
   */
  solve() {
    console.log("[Kissat.solve] Start");
    const result = Module.ccall("kissat_solve", "number", ["number"], [this.solverPtr]);
    console.log("[Kissat.solve] End");
    if (result === 10) {
      return true;
    } else if (result === 20) {
      return false;
    } else {
      return undefined;
    }
  }

  /**
   * @param {number} lit
   * @return {number}
   */
  value(lit) {
    const v = Module.ccall("kissat_value", "number", ["number", "number"], [this.solverPtr, lit]);
    if (v === 0) {
      return lit;
    } else {
      return v;
    }
  }

  /**
   * @param {number[]} vars
   * @return {number[]}
   */
  model(vars) {
    return vars.map((v) => this.value(v));
  }

  /**
   * @param {string} name
   */
  setConfiguration(name) {
    console.log(`[Kissat.setConfiguration] ${name}`);
    Module.ccall("kissat_set_configuration", null, ["number", "string"], [this.solverPtr, name]);
  }

  /**
   * @param {string} name
   * @param {number} v
   */
  setOption(name, v) {
    console.log(`[Kissat.setOption] ${name} = ${v}`);
    Module.ccall("kissat_set_option", null, ["number", "string", "number"], [this.solverPtr, name, v]);
  }

  banner() {
    Module.ccall("kissat_banner", null, ["string", "string"], ["", "Kissat SAT Solver"]);
  }

  printStatistics() {
    Module.ccall("kissat_print_statistics", null, ["number"], [this.solverPtr]);
  }
}
