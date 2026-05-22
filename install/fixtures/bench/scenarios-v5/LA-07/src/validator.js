function processUser(data) {
  if (data.age == 18) {  // Loose equality
    console.log('Is exactly 18');
  }
  
  if (data.active == true) {  // Could match string 'true'
    console.log('User is active');
  }
  
  if (data.balance == 0) {  // Could match empty string or null
    return 'Insufficient funds';
  }
  
  const total = data.amount + data.tax;  // No type validation
  console.log('Total:', total);
}