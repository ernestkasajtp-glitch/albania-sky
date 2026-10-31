import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

type Row = Record<string, any>;
const dialect = new PgDialect();
export const fixture = {
  flights: [] as Row[],
  agent_flight_visibility: [] as Row[],
  agency_group_rules: [] as Row[],
  agency_groups: [] as Row[],
  booking_users: [] as Row[],
  public_enrollments: [] as Row[],
  agents: [] as Row[],
  price_rules: [] as Row[],
  settings: [] as Row[],
  bookings: [] as Row[],
  passengers: [] as Row[],
  payments: [] as Row[],
  writes: 0,
  poolConnections: 0,
};

// Module controls import pool for their write path. Keep the real read logic,
// but fail loudly if this read-only route fixture ever attempts a transaction.
export const pool = {
  async connect(): Promise<never> {
    fixture.poolConnections++;
    throw new Error("Fixture forbids pool connections");
  },
};

// Evaluate the real Drizzle predicate, rather than duplicating the access
// policy in the test. Only the read-only SQL used by these routes is supported.
function matches(condition: any, row: Row): boolean {
  if (!condition) return true;
  const { sql, params } = dialect.sqlToQuery(condition);
  const tokens = sql.match(/"[^"]+"|'[^']*'|\$\d+|[(),.]|<>|<=|>=|=|<|>|\b(?:and|or|upper|trim|ilike|false|true)\b|[a-z_][a-z_0-9]*/gi) ?? [];
  let index = 0;
  function value(): any {
    const token = tokens[index++];
    if (token === "(") { const v = expression(); if (tokens[index++] !== ")") throw Error(sql); return v; }
    if (/^upper$/i.test(token)) { index++; const v = value(); index++; return String(v).toUpperCase(); }
    if (/^trim$/i.test(token)) { index++; const v = value(); index++; return String(v).trim(); }
    if (token.startsWith("$")) return params[Number(token.slice(1)) - 1];
    if (token.startsWith("'")) return token.slice(1, -1);
    if (token.startsWith('"')) {
      let name = token.slice(1, -1);
      if (tokens[index] === ".") { index++; name = tokens[index++].replaceAll('"', ""); }
      return row[Object.keys(row).find(k => k.replaceAll(/[A-Z]/g, c => "_" + c.toLowerCase()) === name) ?? name];
    }
    if (/^(true|false)$/i.test(token)) return token.toLowerCase() === "true";
    throw Error(`Unsupported fixture SQL: ${sql} at ${token}`);
  }
  function comparison(): boolean {
    const left = value();
    const op = tokens[index]?.toLowerCase();
    if (op === "in") {
      index++;
      if (tokens[index++] !== "(") throw Error(sql);
      const values = [value()];
      while (tokens[index] === ",") { index++; values.push(value()); }
      if (tokens[index++] !== ")") throw Error(sql);
      return values.includes(left);
    }
    if (!["=", "<", ">", "<=", ">=", "like", "ilike"].includes(op)) return Boolean(left);
    index++;
    const right = value();
    switch (op) {
      case "=": return left === right;
      case "<": return left < right;
      case ">": return left > right;
      case "<=": return left <= right;
      case ">=": return left >= right;
      case "like":
      case "ilike": {
        if (left == null || right == null) return false;
        let pattern = "^";
        const input = String(right);
        const escape = (char: string) => char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        for (let i = 0; i < input.length; i++) {
          const char = input[i];
          if (char === "\\") {
            if (++i === input.length) throw Error("Invalid fixture LIKE escape");
            pattern += escape(input[i]);
          } else pattern += char === "%" ? ".*" : char === "_" ? "." : escape(char);
        }
        return new RegExp(pattern + "$", op === "ilike" ? "is" : "s").test(String(left));
      }
    }
    throw Error(sql);
  }
  function term(): boolean {
    if (tokens[index] === "(") { index++; const result = expression(); if (tokens[index++] !== ")") throw Error(sql); return result; }
    return comparison();
  }
  function conjunction(): boolean {
    let result = term();
    while (tokens[index]?.toLowerCase() === "and") { index++; const next = term(); result = result && next; }
    return result;
  }
  function expression(): boolean {
    let result = conjunction();
    while (tokens[index]?.toLowerCase() === "or") { index++; const next = conjunction(); result = result || next; }
    return result;
  }
  const result = expression();
  if (index !== tokens.length) throw Error(`Unparsed fixture SQL: ${sql} (${tokens.slice(index)})`);
  return result;
}

function project(fields: Row | undefined, row: Row): Row {
  if (!fields) return row;
  return Object.fromEntries(Object.entries(fields).map(([key, column]) => [
    key, column && typeof column === "object" && "name" in column
      ? row[Object.keys(row).find(k => k.replaceAll(/[A-Z]/g, c => "_" + c.toLowerCase()) === column.name) ?? column.name]
      : column && typeof column === "object" && "id" in column
        ? project(column, row)
        : row,
  ]));
}

function select(fields?: Row, distinct = false) {
  let rows: Row[] = [];
  let result: Row[] = [];
  const query = {
    from(table: any) {
      const name = getTableName(table) as keyof typeof fixture;
      rows = fixture[name] as Row[];
      result = rows.map(r => project(fields, r));
      return query;
    },
    where(condition: any) {
      result = rows.filter(r => matches(condition, r)).map(r => project(fields, r));
      if (distinct) result = [...new Map(result.map(r => [JSON.stringify(r), r])).values()];
      return query;
    },
    leftJoin(_table: any, _condition: any) {
      result = rows.map(r => project(fields, r));
      return query;
    },
    orderBy() { return query; },
    union(other: any) {
      return Promise.resolve(query).then(left => Promise.resolve(other).then(right =>
        [...new Map([...left, ...right].map(r => [JSON.stringify(r), r])).values()]));
    },
    then(resolve: (rows: Row[]) => unknown, reject?: (error: unknown) => unknown) {
      try { return Promise.resolve(result).then(resolve, reject); }
      catch (err) { return Promise.reject(err).then(resolve, reject); }
    },
  };
  return query;
}

export const db = {
  select: (fields?: Row) => select(fields),
  selectDistinct: (fields?: Row) => select(fields, true),
  insert: (table: any) => {
    if (getTableName(table) === "settings") {
      return { values: (row: Row) => ({ onConflictDoUpdate: async ({ set }: { set: Row }) => {
        fixture.writes++;
        const existing = fixture.settings.find(value => value.key === row.key);
        if (existing) Object.assign(existing, set);
        else fixture.settings.push(row);
      } }) };
    }
    fixture.writes++; throw Error("Fixture forbids database writes");
  },
  update: () => { fixture.writes++; throw Error("Fixture forbids database writes"); },
  delete: (table: any) => {
    if (getTableName(table) === "settings") {
      return { where: async (condition: any) => {
        fixture.writes++;
        fixture.settings.splice(0, fixture.settings.length, ...fixture.settings.filter(row => !matches(condition, row)));
      } };
    }
    fixture.writes++; throw Error("Fixture forbids database writes");
  },
};