import * as readline from 'readline'
import knex, { CreateTableBuilder, ColumnBuilder, SchemaBuilder } from 'knex'

// TODO refactor

// === COLUMN

interface ColumnType {
  string: string
  int: number
}

interface Column<T extends keyof ColumnType> {
  type: T
  nullable?: boolean
  primary?: boolean
  initial?: ColumnType[T]
}

export const primary = (): Column<'int'> => ({
  type: 'int',
  primary: true,
})

export const column = <T extends keyof ColumnType>(
  type: T,
  params?: Omit<Column<T>, 'type'>,
): Column<T> =>
  ({ ...params, type })

// === Entity

type EntityColumns =
  { [name: string]: Column<keyof ColumnType> }

type ExtractColumnType<T> =
  T extends Column<infer U> ? ColumnType[U] : never

export type Entity<T extends EntityColumns> =
  { [K in keyof T]: ExtractColumnType<T[K]> }

export type EntityDefinitions =
  { [x: string]: EntityColumns }

// === DATABASE

export interface DatabaseOptions<T extends EntityDefinitions> {
  entities: T
  connection: string
}

function getColAliases(colType: keyof ColumnType): string[] {
  switch (colType) {
    case 'int': return ['int', 'integer']
    case 'string': return ['string', 'character varying']
    default: return []
  }
}

function getColumnBuilder(
  table: CreateTableBuilder,
  colName: string,
  col: Column<keyof ColumnType>,
): ColumnBuilder {
  switch (col.type) {
    case 'int': return table.integer(colName)
    case 'string': return table.string(colName)
  }
}

function constructColumn(
  table: CreateTableBuilder,
  colName: string,
  col: Column<keyof ColumnType>
): ColumnBuilder {
  const builder = getColumnBuilder(table, colName, col)
  if (col.primary) builder.primary()
  if (col.initial) builder.defaultTo(col.initial)
  if (col.nullable) builder.nullable()
  else builder.notNullable().defaultTo(col.initial || getDefault(col.type))
  return builder
}

function getDefault(type: keyof ColumnType): ColumnType[keyof ColumnType] {
  switch (type) {
    // FIXME the type annotation is wrong, i could easily return a string here
    case 'int': return 0

    case 'string': return ''
  }
}

interface ValidationReport {
  msg: string
  migration?: () => SchemaBuilder
}

async function validateEntity(
  entityName: string,
  cols: EntityColumns,
  client: knex
): Promise<ValidationReport[]> {
  const exists = await client.schema.hasTable(entityName)

  if (!exists) {
    return [{ msg: `${entityName}: table is not found` }]
  }

  const reports: ValidationReport[] = []
  const builder = client(entityName)

  const viewNull = (nullable?: boolean): string =>
    nullable ? '"nullable"' : '"not nullable"'

  for (const [colName, data] of Object.entries(cols)) {
    const info = await builder.columnInfo(colName)
    if (!info.type) {
      reports.push({
        msg: `could not find column "${colName}"`,
        migration: () => client.schema
          .alterTable(entityName, t => constructColumn(t, colName, data)),     
      })
      continue
    }
    if (!getColAliases(data.type).includes(info.type)) {
      reports.push({
        msg: `"${colName}" is defined as ${data.type} but instead saw ${info.type}`,
        migration: () => client.schema
          .alterTable(entityName, t => constructColumn(t, colName, data).alter()),
      })
    }
    if (info.nullable !== Boolean(data.nullable)) {
      reports.push({
        msg: `"${colName}" is defined as ${viewNull(data.nullable)} but instead saw ${viewNull(info.nullable)}`,
        migration: () => client.schema
          .alterTable(entityName, t => constructColumn(t, colName, data).alter()),
      })
    }
  }

  return reports
}

export const create = async <T extends EntityDefinitions>(opts: DatabaseOptions<T>) => {
  const client = knex({
    client: 'pg',
    connection: opts.connection,
  })

  const validationTasks = Object
    .entries(opts.entities)
    .map(([entityName, cols]) => validateEntity(entityName, cols, client))

  const reports = (await Promise.all(validationTasks)).flat()

  if (reports.length) {
    for (const report of reports) console.log(report.msg)

    const io = readline.createInterface(process.stdin, process.stdout)
    io.question('Do you want to run corresponding migrations? (y/N)', async answer => {
      if (answer !== 'y') process.exit()
      for (const report of reports) {
        if (report.migration) await report.migration()
      }
      console.log('Done')
      io.close()
    })
  }

  return {
    async findOne<K extends keyof T>(name: K): Promise<Entity<T[K]> | null> {
      const res = await client
        .select('*')
        .from(name as string)
        .first()
      return res || null
    },
  }
}
