import * as funorm from '../main'
import { env } from './env'

const User = {
  id: funorm.primary(),
  name: funorm.column('string'),
  email: funorm.column('string', { nullable: true }),
}

const Product = {
  id: funorm.primary(),
  cost: funorm.column('int'),
  name: funorm.column('string'),
}

const options = {
  connection: env.DATABASE_CONNECTION,
  entities: {
    user: User,
    product: Product,
  },
}

;(async function main() {
  const database = await funorm.create(options)
  const user = await database.findOne('user')
  console.log(user)
}())
