import { Point } from './point.js';
import { Piece } from './piece.js';
import { CNF_Constructor } from './cnf_constructor.js';

class LegionSolver {
    pausePromise;
    pauseResolve;
    iterations
    directionFree;
    success;
    shouldStop;

    constructor(board, pieces, onBoardUpdated) {
        this.board = board;
        this.pieces = pieces;
        this.onBoardUpdated = onBoardUpdated;
        this.iterations = 0;
        this.pieceLength = pieces.length;
        this.valid = true;
        this.pieceNumber = 0;
        this.transformationNumber = 0;
        this.restrictedPieceNumber = 0;
        this.restrictedTransformationNumber = 0;
        this.time = new Date().getTime();
        this.history = [];

        this.middle = [];
        for (let i = this.board.length / 2 - 1; i < this.board.length / 2 + 1; i++) {
            for (let j = this.board[0].length / 2 - 1; j < this.board[0].length / 2 + 1; j++) {
                if (this.board[i][j] != -1) {
                    this.middle.push(new Point(j, i));
                }
            }
        }

        this.emptySpots = [];
        for (let i = 0; i < this.board.length; i++) {
            for (let j = 0; j < this.board[0].length; j++) {
                if (this.board[i][j] == 0) {
                    this.emptySpots.push(new Point(j, i));
                }
            }
        }

        this.restrictedSpots = [];
        for (let i = 0; i < this.board.length; i++) {
            for (let j = 0; j < this.board[0].length; j++) {
                this.searchSurroundings(j, i);
            }
        }

        this.longSpaces = [];
        for (let i = 0; i < this.board.length; i++) {
            for (let j = 0; j < this.board[0].length; j++) {
                if (this.checkLongSpace(j, i) == "horizontal") {
                    this.longSpaces.push(new Point(j, i));
                }
                if (this.checkLongSpace(j, i) == "vertical") {
                    this.longSpaces.push(new Point(j, i));
                }
            }
        }
        this.firstAlgorithm = !!this.longSpaces.length;
    }

    async solve() {
        console.log("Solving started");
        console.log(this)
        console.log(this.board);
        console.log(this.var_lists);
        console.log(this.pieces);

        const worker = new Worker("./kissat_worker.js");
        this.worker = worker;
        let resolveWait;
        const waitForSolver = new Promise((resolve) => {
            resolveWait = resolve;
        });
        var solved = false;
        var solutions = null;
        var workerReady = false;

        this.generateVariablesByPieceRowColOri(this.pieces);
        this.consraintForGridOccupation(this.board);
        this.constraintForPieceUsage();
        // this.constraintForCenterOccupation();
        console.log(`Total variables: ${this.lits.length}`);
        console.log(`Total clauses: ${this.clauses.length}`);
        // var kissat_solver = new Kissat();
        worker.onmessage = (ev) => {
            if (ev.data === true) {
                workerReady = true;
            } else {
                const { sat, model } = ev.data;
                console.log("Message received from worker");
                console.log(`SAT: ${sat}`);
                console.log(`Model: ${model}`);
                // console.log(this.var_map);
                solved = sat;
                solutions = model;
                resolveWait();
            }
        }
        while (!workerReady) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        console.time("Solving time");
        worker.postMessage({ vars: this.lits, clauses: this.clauses });
        this.lits = null;
        this.clauses = null;
        this.var_lists = null;
        this.middle_vars = null;
        this.rc_to_varlist = null;
        globalThis.gc?.();
        console.log("Garbage collection triggered");

        await waitForSolver;
        console.timeEnd("Solving time");
        console.log("Solving finished");
        if (!solved) {
            console.log("No solution found");
            this.success = false;
            return false;
        }
        this.mapSolution(solutions);
        console.log(this.placements);
        console.log(this.board);
        console.log(this.pieces);
        this.success = true;
        return true;

        // this.pieces.sort((a, b) => b.amount * b.cellCount - a.amount * a.cellCount);
        // this.pieces.push(new Piece([[]], 0, -1));
        // this.restrictedSpots.sort((a, b) => b.spotsFilled - a.spotsFilled);
        // this.success = await this.solveInternal();
        // console.log(this.pieces)
        // console.log(this.board)
        // return this.success;
    }

    generateVariablesByPieceRowColOri(pieces){
        const ROW = 20;
        const COL = 22;
        var var_lists = [];
        this.piece_counts = [];
        this.lits = [];
        this.var_map = new Map();
        this.clauses = [];
        this.rc_to_varlist = new Map();
        this.middle_vars = new Set();
        const middle = [[9, 10],[9,11],[10,10],[10,11]];

        var lit_count = 1;
        for (let p = 0; p < pieces.length; p++) {
            var piece_count = pieces[p].amount;
            var piece_orientaions = pieces[p].transformations.length;
            var idx = var_lists.length;
            if (piece_count <= 0){
                continue;
            } 
            var_lists.push([]);
            this.piece_counts.push(piece_count);
            for (let r = 0; r < ROW; r++) {
                for (let c = 0; c < COL; c++) {
                    for (let o = 0; o < piece_orientaions; o++) {
                        var covered_grids = [];
                        var [occupied, centers] = this.getOccupancyFromParams(p, r, c, o);
                        var valid_position = true;
                        var covers_center = false;

                        for (let i = 0; i < occupied.length; i++) {
                            let grid_r = occupied[i][0];
                            let grid_c = occupied[i][1];
                            if (grid_r < 0 || grid_r >= ROW || grid_c < 0 || grid_c >= COL || this.board[grid_r][grid_c] == -1){
                                valid_position = false;
                                break;
                            }
                            covered_grids.push([`R${grid_r}C${grid_c}`]);
                        }
                        for (const center of centers){
                            let cr = center[0];
                            let cc = center[1];
                            for (let m = 0; m < middle.length; m++) {
                                if (cr == middle[m][0] && cc == middle[m][1]) {
                                    covers_center = true;
                                    break;
                                }
                            }
                        }

                        if (!valid_position){
                            continue;
                        }

                        // console.log(`Creating var for P${p} C${count} R${r} C${c} O${o}`);
                        var var_name = `P${p}_C${0}_R${r}_C${c}_O${o}`;
                        var_lists[idx].push(var_name);
                        this.var_map.set(var_name, lit_count);
                        this.lits.push(lit_count);
                        // Map rc to var list
                        for (let g = 0; g < covered_grids.length; g++) {
                            let grid_key = covered_grids[g][0];
                            if (!this.rc_to_varlist.has(grid_key)){
                                this.rc_to_varlist.set(grid_key, []);
                            }
                            this.rc_to_varlist.get(grid_key).push(var_name);
                        }
                        if (covers_center) {
                            this.middle_vars.add(var_name);
                        }
                        lit_count++;
                        
                    }
                }
            }
            
        }
        this.var_lists = var_lists;
    }

    consraintForGridOccupation(board){
        for (let [grid_key, var_names] of this.rc_to_varlist.entries()) {
            const lits = this.convertVarNamesToLit(var_names);
            const clauses = this.exactlyOne(lits);
            for (let i = 0; i < clauses.length; i++) {
                this.clauses.push(clauses[i]);
            }
        }
    }

    // Use at most K is fine since grid occupation requires at least K usage already
    constraintForPieceUsage(){
        for (let p = 0; p < this.var_lists.length; p++) {
            const piece_vars = this.var_lists[p];
            // this.solver.require(Logic.exactlyOne(piece_vars));
            const lits = this.convertVarNamesToLit(piece_vars);
            const piece_count = this.piece_counts[p];
            const clauses = this.atMostK(lits, piece_count);
            for (let i = 0; i < clauses.length; i++) {
                this.clauses.push(clauses[i]);
            }
        }
    }

    constraintForCenterOccupation(){
        // this.solver.require(Logic.or(Array.from(this.middle_vars)));
        const lits = this.convertVarNamesToLit(Array.from(this.middle_vars));
        this.clauses.push(lits);
    }

    checkOccupy(board_r, board_c, var_name){
        const parts = var_name.split('_');
        const p = parseInt(parts[0].substring(1));
        const r = parseInt(parts[2].substring(1));
        const c = parseInt(parts[3].substring(1));
        const o = parseInt(parts[4].substring(1));
        let occupied = false;
        let center_occupied = false;
        // console.log(`Checking var ${var_name} for board cell R${board_r} C${board_c}`);
        const [occupancy, center] = this.getOccupancyFromParams(p, r, c, o);
        for (let i = 0; i < occupancy.length; i++) {
            if (occupancy[i][0] == board_r && occupancy[i][1] == board_c) {
                occupied = true;
                break;
            }
        }
        for (let i = 0; i < center.length; i++) {
            if (center[i][0] == board_r && center[i][1] == board_c) {
                center_occupied = true;
                break;
            }
        }
        return [occupied, center_occupied];
    }

    getOccupancyFromParams(p, r, c, o){
        var piece = this.pieces[p];
        // console.log(`Piece ${p} at row ${r}, col ${c}, orientation ${o}`);
        // console.log(piece.transformations[o]);
        // console.log(piece.transformations[o].shape);
        var block = piece.transformations[o].shape;
        var occupied = [];
        var center = [];
        for (let i = 0; i < block.length; i++) {
            if (!Array.isArray(block[i])) {
                if (block[i] > 0) {
                    occupied.push([r + i, c]);
                    if (block[i] == 2) {
                        center.push([r + i, c]);
                    }
                }
                continue;
            }
            for (let j = 0; j < block[i].length; j++) {
                if (block[i][j] > 0) {
                    occupied.push([r + i, c + j]);
                    if (block[i][j] == 2) {
                        center.push([r + i, c + j]);
                    }
                }
            }
        }
        return [occupied, center];
    }

    newVar(){
        const lit = this.lits.length + 1;
        this.lits.push(lit);
        return lit;
    }

    exactlyOne(vars){
        console.log(`Adding exactly one constraint for ${vars.length} variables`);
        var clauses = [];
        // At least one is true
        clauses.push(vars.slice());
        
        // At most one is true               
        const at_most_one_clauses = this.atMostOne(vars);
        for (let i = 0; i < at_most_one_clauses.length; i++) {
            clauses.push(at_most_one_clauses[i]);
        }

        return clauses;
    }

    atMostOne(vars){
        var clauses = [];
        var prev_aux = null;
        // Ladder encoding
        for (let i = 0; i < vars.length - 1; i++) {
            const xi = vars[i];
            const aux = this.newVar();

            // xi -> si
            clauses.push([-xi, aux]);
            // si-1 -> si
            if (prev_aux !== null) {
                clauses.push([-prev_aux, aux]);
            }
            // xi+1 -> ~si
            const xi_next = vars[i + 1];
            clauses.push([-aux, -xi_next]);

            prev_aux = aux;
        }
        return clauses;
    }


    atMostK(vars, k){
        console.log(`Adding at most ${k} constraint for ${vars.length} variables`);
        if (k == 1){
            return this.atMostOne(vars);
        }
        if (k > 5){
            const cnf = new CNF_Constructor(this);
            // cnf.at_most_k_adder(vars, k);
            cnf.at_most_k_commander_totalizer(vars, k, 32);
            return cnf.clauses_to_add;
        }

        // Ladder encoding
        const n = vars.length;
        var clauses = [];

        if (k >= n || n === 0) {
            return clauses;
        }

        if (k === 0) {
            // All vars must be false
            for (let i = 0; i < vars.length; i++) {
                clauses.push([-vars[i]]);
            }
            return clauses;
        }

        // allocate s[i][j] for i=0..n-1, j=1..k
        const s = Array.from({ length: n }, () => Array(k + 1).fill(0));
        for (let i = 0; i < n; i++) {
            for (let j = 1; j <= k; j++) {
                s[i][j] = this.newVar();
            }
        }

        const x = vars;

        // 1) x1 -> s1,1   : (¬x1 ∨ s[0][1])
        clauses.push([-x[0], s[0][1]]);

        // 2) xi -> si,1   for i = 2..n : (¬xi ∨ s[i][1])
        for (let i = 1; i < n; i++) {
            clauses.push([-x[i], s[i][1]]);
        }

        // 3) s(i-1,j) -> s(i,j)  for i=2..n, j=1..k
        //    (¬s[i-1][j] ∨ s[i][j])
        for (let i = 1; i < n; i++) {
            for (let j = 1; j <= k; j++) {
                clauses.push([-s[i - 1][j], s[i][j]]);
            }
        }

        // 4) x_i ∧ s(i-1,k) forbidden for i = 2..n
        //    (¬x_i ∨ ¬s[i-1][k])
        for (let i = 1; i < n; i++) {
            clauses.push([-x[i], -s[i - 1][k]]);
        }

        // 5) x_i ∧ s(i-1,j-1) -> s(i,j)
        //    (¬x_i ∨ ¬s[i-1][j-1] ∨ s[i][j]) for i=2..n, j=2..k
        for (let i = 1; i < n; i++) {
            for (let j = 2; j <= k; j++) {
                clauses.push([-x[i], -s[i - 1][j - 1], s[i][j]]);
            }
        }

        return clauses;
    }

    convertVarNamesToLit(var_names){
        var lits = [];
        for (let i = 0; i < var_names.length; i++) {
            lits.push(this.var_map.get(var_names[i]));
        }
        return lits;
    }


    mapSolution(solutions){
        var idx = 0;
        var placements = [];
        var piece_count_map = new Map();
        for (let [var_name, lit] of this.var_map.entries()) {
            if (solutions[idx] > 0) {
                placements.push(var_name);
                const parts = var_name.split('_');
                const p = parseInt(parts[0].substring(1));
                const r = parseInt(parts[2].substring(1));
                const c = parseInt(parts[3].substring(1));
                const o = parseInt(parts[4].substring(1));

                if (!piece_count_map.has(p)){
                    piece_count_map.set(p, 0);
                }
                piece_count_map.set(p, piece_count_map.get(p) + 1);

                const [covered, center_covered] = this.getOccupancyFromParams(p,r,c,o);
                const piece_id = this.pieces[p].id;
                this.history.push([]);
                for (let i = 0; i < covered.length; i++) {
                    let grid_r = covered[i][0];
                    let grid_c = covered[i][1];
                    this.board[grid_r][grid_c] = piece_id;
                    this.history[this.history.length - 1].push(new Point(grid_c, grid_r));
                    // console.log(`Placing piece ${piece_id} at R${grid_r} C${grid_c} to value ${this.board[grid_r][grid_c]}`);
                }
                for (let i = 0; i < center_covered.length; i++) {
                    let grid_r = center_covered[i][0];
                    let grid_c = center_covered[i][1];
                    this.board[grid_r][grid_c] = piece_id + 18;
                    // console.log(`Placing piece ${piece_id} at R${grid_r} C${grid_c} to value ${this.board[grid_r][grid_c]}`);
                }

            }
            idx++;
        }
        this.placements = placements;

        var no_overuse = true
        console.log(`Piece usage requirements:`);
        console.log(piece_count_map);
        for (let [p, count] of piece_count_map.entries()) {
            if (count > this.pieces[p].amount) {
                no_overuse = false;
                console.log(`Piece ${p} overused: used ${count}, allowed ${this.pieces[p].amount}`);
            }
        }
        if (no_overuse) {
            console.log("No pieces overused.");
        }
    }

    async solveInternal(batchSize=30000) {
        let stack = [];
        let spotsMoved;
        let piece;
        let point;
        let position = 0;

        while (this.pieces[0].amount > 0 || !this.valid) {
            if (this.shouldStop) {
                return;
            }
            if (this.valid && this.restrictedSpots.length != 0 && this.pieces[this.restrictedPieceNumber].amount && this.directionFree != 5 && !this.firstAlgorithm) {
                if (this.restrictedPieceNumber != this.pieceLength) {
                    point = this.restrictedSpots[0];
                    piece = this.pieces[this.restrictedPieceNumber].restrictedTransformations[this.restrictedTransformationNumber];
                    this.determineDirectionFree(point);
                    if (this.isPlaceable(point, piece)) {
                        stack.push([0, 0, this.takeFromList(this.restrictedPieceNumber), [...this.restrictedSpots], 
                        point, this.restrictedPieceNumber, this.restrictedTransformationNumber, this.directionFree, [], 0, this.valid]);
                        this.restrictedSpots.splice(0, 1);
                        this.placePiece(point, piece);
                        this.isValid();
                        this.restrictedPieceNumber = 0;
                        this.restrictedTransformationNumber = 0;
                    } else {
                        this.changeIndex(true);
                    }
                }
            } else if (this.valid && this.pieces[this.pieceNumber].amount && (this.firstAlgorithm || this.restrictedSpots.length == 0) && this.directionFree != 5){
                this.directionFree = 0;
                if (!this.firstAlgorithm) {
                    position = 0;
                    while (position < this.emptySpots.length && this.board[this.emptySpots[position].y][this.emptySpots[position].x] != 0) {
                        position++;
                    }
                } else {

                }
                if (position == this.emptySpots.length) {
                    return true;
                }
                point = this.emptySpots[position];
                piece = this.pieces[this.pieceNumber].transformations[this.transformationNumber];
                if (this.isPlaceable(point, piece)) {
                    let filler = [];
                    for (let i = 0; i < this.longSpaces.length; i++) {
                        filler.push(this.longSpaces[i]);
                    }
                    stack.push([this.pieceNumber, this.transformationNumber, this.takeFromList(this.pieceNumber), [...this.restrictedSpots],
                    point, 0, 0, 0, filler, position, this.valid]);
                    this.placePiece(point, piece);
                    this.isValid();

                    if (this.firstAlgorithm) {
                        while (position < this.emptySpots.length && this.board[this.emptySpots[position].y][this.emptySpots[position].x] != 0) {
                            position++;
                        }
                        if (position == this.emptySpots.length) {
                            return true;
                        }
                    }

                    this.pieceNumber = 0;
                    this.transformationNumber = 0;
                } else {
                    this.changeIndex(false);
                }
            } else {
                if (stack.length == 0) {
                    return false;
                }
                if (!this.valid) {
                    this.valid = true;
                }

                [this.pieceNumber, this.transformationNumber, spotsMoved, this.restrictedSpots,
                    point, this.restrictedPieceNumber, this.restrictedTransformationNumber, this.directionFree, this.longSpaces, position, this.valid] = stack.pop();
                if (this.directionFree == 0) {
                    this.returnToList(this.pieceNumber, spotsMoved);
                    this.takeBackPiece(point, this.pieces[this.pieceNumber].transformations[this.transformationNumber])
                } else {
                    this.returnToList(this.restrictedPieceNumber, spotsMoved);
                    this.takeBackPiece(point, this.pieces[this.restrictedPieceNumber].restrictedTransformations[this.restrictedTransformationNumber])
                }
                this.firstAlgorithm = !(this.longSpaces.length == 0);
                if (!this.firstAlgorithm) {
                    this.changeIndex(!this.restrictedSpots.length == 0)
                } else {
                    this.changeIndex(false);
                }

            }

            this.iterations++;
            if (this.iterations % batchSize == 0) {
                this.onBoardUpdated();
                await new Promise(resolve => setTimeout(resolve, 0));
                await this.pausePromise;
            }
        }

        return true;
    }

    takeFromList(placement) {
        this.pieces[placement].amount--;
        let fill = this.pieces[placement];
        let index = placement + 1;
        while (fill.amount * fill.cellCount < this.pieces[index].amount * this.pieces[index].cellCount)
            index++;
        this.pieces[placement] = this.pieces[index - 1];
        this.pieces[index - 1] = fill;
        return index - 1 - placement;
    }

    returnToList(placement, spotsMoved) {
        let fill = this.pieces[placement];
        this.pieces[placement] = this.pieces[placement + spotsMoved];
        this.pieces[placement + spotsMoved] = fill;
        this.pieces[placement].amount++;
    }

    isValid() {
        if (this.middle.length == 0)
            return true;

        let normalPieces = 0;
        for (let point of this.middle) {
            if (this.board[point.y][point.x] > 0 && this.board[point.y][point.x] <= this.pieceLength) {
                normalPieces++;
            }
        }

        this.valid = normalPieces != this.middle.length;
    }

    isPlaceable(position, piece) {
        if (!piece) {
            return false;
        }
        for (let point of piece.pointShape) {
            let x;
            let y;
            [x, y] = this.determinePoint(position, piece, point);
            if (
                y >= this.board.length
                || y < 0
                || x >= this.board[0].length
                || x < 0
                || this.board[y][x] != 0) {
                return false;
            }
        }

        return true;
    }


    placePiece(position, piece) {
        let realPoints = []
        this.history[this.history.length] = [];
        for (let point of piece.pointShape) {
            let x;
            let y;
            [x, y] = this.determinePoint(position, piece, point);
            if (!point.isMiddle) {
                this.board[y][x] = piece.id;
            } else {
                this.board[y][x] = piece.id + 18;
            }
            realPoints.push(new Point(x, y))
            this.history[this.history.length - 1].push(new Point(x, y))
            for (let i = 0; i < this.restrictedSpots.length; i++) {
                if (this.restrictedSpots[i].x == x && this.restrictedSpots[i].y == y) {
                    this.restrictedSpots.splice(i, 1)
                    i--;
                }
            }
            for (let i = 0; i < this.longSpaces.length; i++) {
                if (this.longSpaces[i].x == x && this.longSpaces[i].y == y) {
                    this.longSpaces.splice(i, 1)
                    i--;
                }
            }
            if (this.longSpaces.length == 0) {
                this.firstAlgorithm = false;
            }
        }
        for (let point of realPoints) {
            this.searchSurroundings(point.x, point.y + 1)
            this.searchSurroundings(point.x, point.y - 1)
            this.searchSurroundings(point.x + 1, point.y)
            this.searchSurroundings(point.x - 1, point.y)
        }

        let spliceElements = []
        for (let i = 0; i < this.restrictedSpots.length - 1; i++) {
            for (let j = i + 1; j < this.restrictedSpots.length; j++) {
                if (this.restrictedSpots[i].x == this.restrictedSpots[j].x && this.restrictedSpots[i].y == this.restrictedSpots[j].y) {
                    spliceElements.push(i);
                }
            }
        }
        for (let i = spliceElements.length - 1; i >= 0; i--) {
            this.restrictedSpots.splice(spliceElements[i], 1);
        }
        this.restrictedSpots.sort((a, b) => b.spotsFilled - a.spotsFilled)
    }

    takeBackPiece(position, piece) {
        this.history.pop();
        for (let point of piece.pointShape) {
            let x;
            let y;
            [x, y] = this.determinePoint(position, piece, point);
            this.board[y][x] = 0;
        }
    }

    searchSurroundings(x, y) {
        let restrictedSpaces = 0;
        if (this.board[y] && this.board[y][x] == 0) {
            if (this.board[y + 1] && this.board[y + 1][x] == 0) {
                restrictedSpaces++;
            }
            if (this.board[y - 1] && this.board[y - 1][x] == 0) {
                restrictedSpaces++;
            }
            if (this.board[y] && this.board[y][x + 1] == 0) {
                restrictedSpaces++;
            }
            if (this.board[y] && this.board[y][x - 1] == 0) {
                restrictedSpaces++;
            }
            if (restrictedSpaces <= 1) {
                this.restrictedSpots.push(new RestrictedPoint(x, y, 4 - restrictedSpaces));
            }
        }
    }

    checkLongSpace(x, y) {
        if (this.board[y + 1] && this.board[y + 1][x] == 0
            && this.board[y - 1] && this.board[y - 1][x] == 0
            && this.board[y] && this.board[y][x + 1] != 0
            && this.board[y] && this.board[y][x - 1] != 0) {
            return "vertical";
        }
        if (this.board[y + 1] && this.board[y + 1][x] != 0
            && this.board[y - 1] && this.board[y - 1][x] != 0
            && this.board[y] && this.board[y][x + 1] == 0
            && this.board[y] && this.board[y][x - 1] == 0) {
            return "horizontal";
        }
    }

    changeIndex(restricted) {
        if (restricted) {
            if (this.restrictedTransformationNumber < this.pieces[this.restrictedPieceNumber].restrictedTransformations.length - 1) {
                this.restrictedTransformationNumber++;
            } else {
                this.restrictedPieceNumber++;
                this.restrictedTransformationNumber = 0;
            }
        } else {
            if (this.transformationNumber < this.pieces[this.pieceNumber].transformations.length - 1) {
                this.transformationNumber++;
            } else {
                this.pieceNumber++;
                this.transformationNumber = 0;
            }
        }
    }

    determineDirectionFree(point) {
        if (this.board[point.y - 1] && this.board[point.y - 1][point.x] == 0) {
            this.directionFree = 1;
        } else if (this.board[point.y] && this.board[point.y][point.x + 1] == 0) {
            this.directionFree = 2;
        } else if (this.board[point.y + 1] && this.board[point.y + 1][point.x] == 0) {
            this.directionFree = 3;
        } else if (this.board[point.y] && this.board[point.y][point.x - 1] == 0) {
            this.directionFree =  4;
        } else {
            this.directionFree = 5;
        }
    }

    determinePoint(position, piece, point) {
        let x;
        let y;
        if (this.directionFree == 0 || this.directionFree == 3 || this.directionFree == 5) {
            x = position.x + point.x - piece.offCenter;
            y = position.y + point.y;
        } else if (this.directionFree == 1) {
            x = position.x - point.x + piece.offCenter;
            y = position.y - point.y;
        } else if (this.directionFree == 2) {
            x = position.x + point.y;
            y = position.y + point.x - piece.offCenter;
        } else {
            x = position.x - point.y;
            y = position.y - point.x + piece.offCenter;
        }
        return [x, y];
    }

    pause() {
        this.time -= new Date().getTime();
        if (this.iterations != 0) {
            document.getElementById("iterations").style.visibility = 'visible';
            document.getElementById("iterationsValue").innerText = `${this.iterations}`;

            document.getElementById("time").style.visibility = 'visible';
            document.getElementById("timeValue").innerText = `${-this.time}ms`;
        }
        this.pausePromise = new Promise(resolve => this.pauseResolve = resolve);
    }

    continue() {
        this.time += new Date().getTime();
        document.getElementById("iterations").style.visibility = 'hidden';
        document.getElementById("time").style.visibility = 'hidden';
        this.pauseResolve();
        this.pausePromise = null;
    }

    stop() {
        this.shouldStop = true;
        this.worker.terminate();
        console.log("Worker terminated");
    }
}

class RestrictedPoint extends Point {
    constructor(x, y, spotsFilled) {
        super(x, y)
        this.spotsFilled = spotsFilled;
    }
}

export { LegionSolver };