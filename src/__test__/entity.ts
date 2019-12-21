import * as funorm from '../main'

const withUser = funorm.entity('user', {
  id: funorm.primary(),
  name: funorm.column('string'),
  email: funorm.column('string', { nullable: true }),
})

const withProduct = funorm.entity('product', {
  id: funorm.primary(),
  cost: funorm.column('int'),
  name: funorm.column('string'),
})

const database =
  withUser(
  withProduct(
    funorm.connect()))

database.findOne('product')
