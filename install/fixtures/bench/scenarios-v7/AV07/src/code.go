func withdraw(account *Account, amount int) bool {
  if account.balance >= amount {  // BUG: TOCTTOU - balance read, then write
    time.Sleep(1 * time.Millisecond)
    account.balance -= amount
    return true
  }
  return false
}