class TransactionManager {
  async transferMoney(fromId, toId, amount) {
    await this.acquireLock(fromId);
    const fromBalance = await this.getBalance(fromId);
    
    if (fromBalance < amount) {
      this.releaseLock(fromId);
      throw new Error('Insufficient funds');
    }
    
    await this.acquireLock(toId);
    const toBalance = await this.getBalance(toId);
    
    await this.updateBalance(fromId, fromBalance - amount);
    await this.updateBalance(toId, toBalance + amount);
    
    this.releaseLock(fromId);
    this.releaseLock(toId);
  }
}