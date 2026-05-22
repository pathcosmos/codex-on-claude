use std::sync::Arc;
let data = Arc::new(vec![1,2,3]);
let d = data.clone();
std::thread::spawn(move || { d.push(4); });