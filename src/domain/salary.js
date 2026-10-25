const { BadRequestError } = require('../errors/AppError');

function assertGroupSize(childrenCount, maxGroupSize = 20) {
  if (!Number.isInteger(childrenCount) || childrenCount < 0 || childrenCount > maxGroupSize) {
    throw new BadRequestError(
      `Children count must be an integer from 0 to ${maxGroupSize}: ${childrenCount}`
    );
  }
}

const extraChildren = (childrenCount, threshold) => Math.max(0, childrenCount - threshold);

function educatorSalary(childrenCount, ratePerChild = 200000, extraPay = 300000, threshold = 12) {
  assertGroupSize(childrenCount);
  return ratePerChild * childrenCount + extraPay * extraChildren(childrenCount, threshold);
}

function assistantSalary(childrenCount, baseSalary = 2000000, extraPay = 300000, threshold = 12) {
  assertGroupSize(childrenCount);
  return baseSalary + extraPay * extraChildren(childrenCount, threshold);
}

function clubTeacherSalary(salary = 4000000) {
  return salary;
}

function managerSalary(salary = 8000000) {
  return salary;
}

module.exports = {
  assertGroupSize,
  educatorSalary,
  assistantSalary,
  clubTeacherSalary,
  managerSalary,
};