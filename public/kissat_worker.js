importScripts("kissat-emscripten.js", "kissat.js");

postMessage(true);  // signal ready

onmessage = (ev) => {
  const {vars, clauses} = ev.data;

    console.log("Worker received message", ev.data);
    self.solver = new Kissat();
    self.solver.initSat();
    // for (const lit of vars) {
    //   self.solver.add(lit);
    // }
    // self.solver.add(0); // terminate vars

    for (const clause of clauses) {
      for (const lit of clause) {
        self.solver.add(lit);
      }
      // self.solver.addClause(clause);
      self.solver.add(0); // terminate clause
    }

    delete ev.data.clauses;
    console.log("Clauses added, starting to solve...");

  
    const sat = self.solver.solve();
    self.solver.printStatistics();
    const model = vars ? self.solver.model(vars) : null;

    self.solver.release();
    postMessage({ sat, model });
    console.log("Worker sent message", { sat, model });
};