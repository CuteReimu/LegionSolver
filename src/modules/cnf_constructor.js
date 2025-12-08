class CNF_Constructor{
    constructor(legion_solver){
        this.add_var = () => legion_solver.newVar();
        this.clauses_to_add = [];
    }

    add_clause(clause){
        this.clauses_to_add.push(clause);
    }

    xor_gate(a, b){
        var out = this.add_var();
        this.add_clause([ -a, -b, -out ]);
        this.add_clause([  a,  b, -out ]);
        this.add_clause([  a, -b,  out ]);
        this.add_clause([ -a,  b,  out ]);
        return out;
    }

    and_gate(a, b){
        var out = this.add_var();
        this.add_clause([ -a, -b,  out ]);
        this.add_clause([  a,     -out ]);
        this.add_clause([      b, -out ]);
        return out;
    }

    or_gate(a, b){
        var out = this.add_var();
        this.add_clause([  a,  b, -out ]);
        this.add_clause([ -a,     out ]);
        this.add_clause([     -b, out ]);
        return out;
    }
        

    half_adder(a, b){
        var sum = this.xor_gate(a, b);
        var carry = this.and_gate(a, b);
        return [sum, carry];
    }

    full_adder(a, b, c_in){
        var [sum1, carry1] = this.half_adder(a, b);
        var [sum, carry2] = this.half_adder(sum1, c_in);
        var carry_out = this.or_gate(carry1, carry2);
        return [sum, carry_out];
    }

    truncated_summer(Xs, n){
        var cur_sum = new Array(n).fill(null).map(() => this.add_var());
        const zero = cur_sum[0];
        for (const b of cur_sum){
            this.add_clause([ -b ]);
        }

        var overflow = null;
        for (var i = 0; i < Xs.length; i++){
            var new_sum = new Array(n).fill(null);
            var [lsb, carry] = this.half_adder(cur_sum[0], Xs[i]);
            new_sum[0] = lsb;

            for (var j = 1; j < n; j++){
                let [s, c] = this.half_adder(cur_sum[j], carry);
                new_sum[j] = s;
                carry = c;
            }
            if (overflow == null){
                overflow = carry;
            } else {
                overflow = this.or_gate(overflow, carry);
            }

            cur_sum = new_sum;
        }
        return [cur_sum, overflow];
    }

    at_most_k_adder(Xs, K){
        if (K <= 0){
            return;
        }
        
        var K_bits = [];

        while (K > 1){
            K_bits.push(K % 2);
            K = Math.floor(K / 2);
        }
        K_bits.push(K);

        var [sum, overflow] = this.truncated_summer(Xs, K_bits.length);
        this.add_clause([ -overflow ]);

        var greater_than_K = this.add_var();
        var equal = this.add_var();
        this.add_clause([ equal ]);  // equal starts as true
        this.add_clause([ -greater_than_K ]);  // greater_than_K starts as false

        for (var j = K_bits.length - 1; j >= 0; j--){
            let cur_greater_than_K;
            let cur_equal;
            if (K_bits[j] == 0){
                cur_greater_than_K = this.or_gate(greater_than_K, this.and_gate(sum[j], equal));
                cur_equal = this.and_gate(equal, -sum[j]);
            } else {
                cur_greater_than_K = greater_than_K;
                cur_equal = this.and_gate(equal, sum[j]);
            }
            greater_than_K = cur_greater_than_K;
            equal = cur_equal;
        }
        this.add_clause([ -greater_than_K ]);
    }

    // Make a unary "leaf" for a single literal x:
    // returns [u] where u ↔ x and u means "sum >= 1".
    make_unary_leaf(x) {
        const u = this.add_var();
        // u <-> x
        this.add_clause([ -x,  u ]);
        this.add_clause([ -u,  x ]);
        return [u];
    }

    // Merge two unary arrays L and R into a new unary S,
    // where S[t-1] means "sum(L)+sum(R) >= t".
    // We truncate at maxVal (K+1).
    merge_unaries(L, R, maxVal) {
        if (L.length === 0) return R.slice(0, maxVal);
        if (R.length === 0) return L.slice(0, maxVal);

        const maxLen = Math.min(L.length + R.length, maxVal);
        const S = new Array(maxLen);
        for (let i = 0; i < maxLen; i++) {
            S[i] = this.add_var();
        }

        // Monotonicity: S[i] -> S[i-1]
        for (let i = 1; i < maxLen; i++) {
            this.add_clause([ -S[i], S[i-1] ]);
        }

        // Left-only contributions: L[i] -> S[i]
        for (let i = 0; i < L.length && i < maxLen; i++) {
            this.add_clause([ -L[i], S[i] ]);
        }

        // Right-only contributions: R[j] -> S[j]
        for (let j = 0; j < R.length && j < maxLen; j++) {
            this.add_clause([ -R[j], S[j] ]);
        }

        // Pairwise: L[i] & R[j] -> S[i+j+1]
        for (let i = 0; i < L.length; i++) {
            for (let j = 0; j < R.length; j++) {
                const idx = i + j + 1; // 0-based index for ">= (i+1)+(j+1)"
                if (idx < maxLen) {
                    this.add_clause([ -L[i], -R[j], S[idx] ]);
                }
            }
        }

        return S;
    }

    // Build a totalizer for one group of literals (a subset of Xs).
    // Returns unary array U_g, truncated at maxVal.
    build_group_totalizer(groupLits, maxVal) {
        let unary = [];
        for (const x of groupLits) {
            const leaf = this.make_unary_leaf(x);
            unary = this.merge_unaries(unary, leaf, maxVal);
        }
        return unary;
    }

    // Commander + Totalizer for SUM(Xs) <= K
    // groupSize is e.g. 8, 12, 16; tune it experimentally.
    at_most_k_commander_totalizer(Xs, K, groupSize = 16) {
        const n = Xs.length;

        if (K <= 0) {
            // All must be false
            for (const x of Xs) this.add_clause([ -x ]);
            return;
        }

        if (n === 0) return;

        // If K >= n, constraint is redundant.
        if (K >= n) return;

        const maxVal = Math.min(K + 1, n);

        // 1) Partition Xs into groups
        const groups = [];
        for (let i = 0; i < n; i += groupSize) {
            groups.push(Xs.slice(i, i + groupSize));
        }

        // 2) Local totalizer per group
        const groupUnaries = [];
        for (const g of groups) {
            const U_g = this.build_group_totalizer(g, maxVal);
            groupUnaries.push(U_g);
            // Note: U_g[0], U_g[1], ... act as "commanders" for this group:
            // at least 1, at least 2, etc.
        }

        // 3) Merge all group unaries into a single top-level unary
        let topUnary = [];
        for (const U_g of groupUnaries) {
            topUnary = this.merge_unaries(topUnary, U_g, maxVal);
        }

        // 4) Enforce sum <= K by forbidding "sum >= K+1"
        // topUnary[K] represents "sum >= K+1" when maxVal == K+1.
        if (maxVal === K + 1) {
            const overflow = topUnary[K];
            this.add_clause([ -overflow ]);
        }
    }
}

export { CNF_Constructor };