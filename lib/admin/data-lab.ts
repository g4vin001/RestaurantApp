import ExcelJS from "exceljs";

export const DATA_LAB_MAX_BYTES = 2 * 1024 * 1024;
export const DATA_LAB_MAX_TABLES = 100;
export const DATA_LAB_MAX_HISTORY = 1_000;

export type DataLabTableRow = {
  tableLabel: string;
  zone: string;
  capacity: number;
  minPartySize: number;
  maxPartySize: number;
  shape: "ROUND" | "SQUARE" | "RECTANGLE" | "BOOTH";
};

export type DataLabHistoryRow = {
  recordId: string;
  tableLabel: string;
  partyName: string;
  partySize: number;
  source: "DIRECT" | "WALK_IN" | "RESERVATION";
  joinedAt?: string;
  promisedWaitMinutes?: number;
  scheduledAt?: string;
  seatedAt?: string;
  clearedAt?: string;
  availableAt?: string;
  outcome: "SEATED" | "CANCELLED" | "NO_SHOW";
};

export type NormalizedDataLabRows = {
  tables: DataLabTableRow[];
  history: DataLabHistoryRow[];
};

export type DataLabValidation = {
  errors: string[];
  warnings: string[];
};

const TABLE_HEADERS = [
  "table_label", "zone", "capacity", "min_party_size", "max_party_size", "shape",
] as const;
const HISTORY_HEADERS = [
  "record_id", "table_label", "party_name", "party_size", "source", "joined_at",
  "promised_wait_minutes", "scheduled_at", "seated_at", "cleared_at", "available_at", "outcome",
] as const;

function cellText(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "text" in (value as object)) {
    return String((value as { text: unknown }).text ?? "").trim();
  }
  return String(value).trim();
}

function positiveInteger(value: unknown) {
  const parsed = Number(cellText(value));
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function parseRestaurantTimestamp(value: unknown): string | undefined {
  if (value === "" || value === null || value === undefined) return undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "number" && Number.isFinite(value)) {
    // Excel serials do not carry an offset. Treat their wall-clock value as
    // restaurant-local time (Asia/Manila for this release), not UTC.
    return new Date(
      Math.round((value - 25_569) * 86_400_000) - 8 * 60 * 60 * 1_000,
    ).toISOString();
  }
  const source = cellText(value);
  if (!source) return undefined;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(source)
    ? `${source}T00:00:00+08:00`
    : /(?:Z|[+-]\d{2}:?\d{2})$/i.test(source)
      ? source
      : `${source.replace(" ", "T")}+08:00`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell.replace(/\r$/, ""));
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += character;
  }
  row.push(cell.replace(/\r$/, ""));
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function recordsFromMatrix(matrix: unknown[][]) {
  const headers = (matrix[0] ?? []).map((value) => cellText(value).toLowerCase());
  return matrix.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
}

function normalizeTables(records: Array<Record<string, unknown>>) {
  return records.map((record) => ({
    tableLabel: cellText(record.table_label),
    zone: cellText(record.zone) || "Main",
    capacity: positiveInteger(record.capacity) ?? -1,
    minPartySize: positiveInteger(record.min_party_size) ?? -1,
    maxPartySize: positiveInteger(record.max_party_size) ?? -1,
    shape: cellText(record.shape).toUpperCase() as DataLabTableRow["shape"],
  }));
}

function normalizeHistory(records: Array<Record<string, unknown>>) {
  return records.map((record) => ({
    recordId: cellText(record.record_id),
    tableLabel: cellText(record.table_label),
    partyName: cellText(record.party_name),
    partySize: positiveInteger(record.party_size) ?? -1,
    source: cellText(record.source).toUpperCase() as DataLabHistoryRow["source"],
    joinedAt: parseRestaurantTimestamp(record.joined_at),
    promisedWaitMinutes: positiveInteger(record.promised_wait_minutes) ?? undefined,
    scheduledAt: parseRestaurantTimestamp(record.scheduled_at),
    seatedAt: parseRestaurantTimestamp(record.seated_at),
    clearedAt: parseRestaurantTimestamp(record.cleared_at),
    availableAt: parseRestaurantTimestamp(record.available_at),
    outcome: cellText(record.outcome).toUpperCase() as DataLabHistoryRow["outcome"],
  }));
}

function assertHeaders(headers: string[], expected: readonly string[], label: string) {
  const missing = expected.filter((header) => !headers.includes(header));
  if (missing.length) throw new Error(`${label} is missing columns: ${missing.join(", ")}.`);
}

export async function parseDataLabUpload(input: {
  filename: string;
  bytes: Uint8Array;
  csvKind?: "tables" | "history";
}): Promise<NormalizedDataLabRows> {
  if (input.bytes.byteLength > DATA_LAB_MAX_BYTES) throw new Error("The file exceeds the 2 MB limit.");
  const filename = input.filename.toLowerCase();
  if (filename.endsWith(".csv")) {
    if (!input.csvKind) throw new Error("Choose whether this CSV contains Tables or History.");
    const matrix = parseCsv(new TextDecoder("utf-8", { fatal: true }).decode(input.bytes));
    const headers = (matrix[0] ?? []).map((value) => cellText(value).toLowerCase());
    assertHeaders(headers, input.csvKind === "tables" ? TABLE_HEADERS : HISTORY_HEADERS, input.csvKind === "tables" ? "Tables CSV" : "History CSV");
    const records = recordsFromMatrix(matrix);
    return input.csvKind === "tables"
      ? { tables: normalizeTables(records), history: [] }
      : { tables: [], history: normalizeHistory(records) };
  }
  if (!filename.endsWith(".xlsx")) {
    throw new Error("Use a UTF-8 .csv or non-macro .xlsx file.");
  }
  const workbook = new ExcelJS.Workbook();
  const copied = input.bytes.buffer.slice(
    input.bytes.byteOffset,
    input.bytes.byteOffset + input.bytes.byteLength,
  ) as ArrayBuffer;
  await workbook.xlsx.load(copied);
  const readSheet = (name: string) => {
    const sheet = workbook.getWorksheet(name);
    if (!sheet) return [];
    const matrix: unknown[][] = [];
    sheet.eachRow((row) => {
      const values = row.values;
      matrix.push(Array.isArray(values) ? values.slice(1) : Object.values(values));
    });
    return matrix;
  };
  const tableMatrix = readSheet("tables");
  const historyMatrix = readSheet("history");
  if (!tableMatrix.length && !historyMatrix.length) {
    throw new Error('XLSX files need a "tables" sheet, a "history" sheet, or both.');
  }
  if (tableMatrix.length) assertHeaders(tableMatrix[0].map((value) => cellText(value).toLowerCase()), TABLE_HEADERS, "tables sheet");
  if (historyMatrix.length) assertHeaders(historyMatrix[0].map((value) => cellText(value).toLowerCase()), HISTORY_HEADERS, "history sheet");
  return {
    tables: tableMatrix.length ? normalizeTables(recordsFromMatrix(tableMatrix)) : [],
    history: historyMatrix.length ? normalizeHistory(recordsFromMatrix(historyMatrix)) : [],
  };
}

export function validateDataLabRows(
  rows: NormalizedDataLabRows,
  existingTables: Array<{ label: string; capacity: number }> = [],
  existingSessions: Array<{
    tableLabel: string;
    seatedAt: Date | string;
    availableAt: Date | string;
    recordId?: string;
  }> = [],
): DataLabValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (rows.tables.length > DATA_LAB_MAX_TABLES) errors.push(`Tables exceed the ${DATA_LAB_MAX_TABLES}-row limit.`);
  if (rows.history.length > DATA_LAB_MAX_HISTORY) errors.push(`History exceeds the ${DATA_LAB_MAX_HISTORY}-row limit.`);
  const tableMap = new Map(existingTables.map((table) => [table.label.toLowerCase(), table.capacity]));
  const tableLabels = new Set<string>();
  rows.tables.forEach((table, index) => {
    const label = `Tables row ${index + 2}`;
    const key = table.tableLabel.toLowerCase();
    if (!table.tableLabel) errors.push(`${label}: table_label is required.`);
    if (tableLabels.has(key) || tableMap.has(key)) errors.push(`${label}: duplicate table label ${table.tableLabel}.`);
    tableLabels.add(key);
    if (table.capacity < 1 || table.capacity > 100) errors.push(`${label}: capacity must be 1-100.`);
    if (table.minPartySize < 1 || table.maxPartySize < table.minPartySize || table.maxPartySize > table.capacity) errors.push(`${label}: party-size range must fit the table capacity.`);
    if (!["ROUND", "SQUARE", "RECTANGLE", "BOOTH"].includes(table.shape)) errors.push(`${label}: shape is invalid.`);
    tableMap.set(key, table.capacity);
  });
  const recordIds = new Set<string>();
  const seatedByTable = new Map<string, Array<{ start: number; end: number; recordId: string }>>();
  for (const session of existingSessions) {
    const key = session.tableLabel.toLowerCase();
    const intervals = seatedByTable.get(key) ?? [];
    intervals.push({
      start: new Date(session.seatedAt).getTime(),
      end: new Date(session.availableAt).getTime(),
      recordId: session.recordId ?? "existing database session",
    });
    seatedByTable.set(key, intervals);
  }
  rows.history.forEach((record, index) => {
    const label = `History row ${index + 2}`;
    if (!record.recordId || recordIds.has(record.recordId)) errors.push(`${label}: record_id is missing or duplicated.`);
    recordIds.add(record.recordId);
    const capacity = tableMap.get(record.tableLabel.toLowerCase());
    if (!capacity) errors.push(`${label}: table ${record.tableLabel || "(blank)"} does not exist.`);
    if (record.partySize < 1 || (capacity && record.partySize > capacity)) errors.push(`${label}: party_size exceeds the table capacity.`);
    if (!["DIRECT", "WALK_IN", "RESERVATION"].includes(record.source)) errors.push(`${label}: source is invalid.`);
    if (!["SEATED", "CANCELLED", "NO_SHOW"].includes(record.outcome)) errors.push(`${label}: outcome is invalid.`);
    if (record.source === "RESERVATION" && !record.scheduledAt) errors.push(`${label}: reservations require scheduled_at.`);
    if (record.source === "WALK_IN" && !record.joinedAt) errors.push(`${label}: walk-ins require joined_at.`);
    if (record.source === "DIRECT" && record.outcome !== "SEATED") {
      errors.push(`${label}: direct history must have a SEATED outcome.`);
    }
    if (record.outcome === "SEATED" && (!record.seatedAt || !record.clearedAt || !record.availableAt)) {
      errors.push(`${label}: seated records require seated_at, cleared_at, and available_at.`);
    }
    if (record.outcome !== "SEATED" && (record.seatedAt || record.clearedAt || record.availableAt)) {
      errors.push(`${label}: cancelled/no-show records cannot include seating timestamps.`);
    }
    const ordered = (
      record.source === "RESERVATION"
        ? [record.scheduledAt, record.seatedAt, record.clearedAt, record.availableAt]
        : record.source === "WALK_IN"
          ? [record.joinedAt, record.seatedAt, record.clearedAt, record.availableAt]
          : [record.seatedAt, record.clearedAt, record.availableAt]
    )
      .filter((value): value is string => Boolean(value))
      .map(Date.parse);
    if (ordered.some((value, orderIndex) => orderIndex > 0 && value < ordered[orderIndex - 1])) {
      errors.push(`${label}: timestamps are not in chronological order.`);
    }
    if (record.outcome === "SEATED" && record.seatedAt && record.availableAt) {
      const key = record.tableLabel.toLowerCase();
      const intervals = seatedByTable.get(key) ?? [];
      intervals.push({ start: Date.parse(record.seatedAt), end: Date.parse(record.availableAt), recordId: record.recordId });
      seatedByTable.set(key, intervals);
    }
    if (record.source === "WALK_IN" && record.promisedWaitMinutes === undefined) warnings.push(`${label}: promised wait is blank, so wait accuracy will be unavailable.`);
  });
  for (const [table, intervals] of seatedByTable) {
    intervals.sort((left, right) => left.start - right.start);
    for (let index = 1; index < intervals.length; index += 1) {
      if (intervals[index].start < intervals[index - 1].end) {
        errors.push(`History records ${intervals[index - 1].recordId} and ${intervals[index].recordId} overlap on ${table}.`);
      }
    }
  }
  return { errors, warnings };
}
