package main
func calcDiscount(orderTotal, discountPercent int32) int32 {
  return orderTotal * discountPercent / 100  // BUG: orderTotal * discountPercent may overflow int32
}