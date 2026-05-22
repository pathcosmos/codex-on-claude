def parse_inventory_csv(text)
  rows = []
  text.split("\n").each_with_index do |line, idx|
    next if idx == 0 && line.start_with?("sku,")
    sku, qty, name = line.split(',')
    next if sku.nil? || sku.strip.empty?
    rows << {
      sku: sku.strip,
      quantity: qty.to_i,
      name: name.strip,
      imported_at: Time.now.utc
    }
  end
  rows
end

sample = "sku,qty,name\nA-1,10,Widget\nB-2,4,\"Large, boxed\""
puts parse_inventory_csv(sample).inspect