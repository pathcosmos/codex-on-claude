// event-bus.rs
pub struct EventBus { opts: std::collections::HashMap<String, String> }
impl EventBus {
  pub fn new() -> Self { Self { opts: Default::default() } }
  pub fn emit(&self, arg: &str) -> String { arg.to_string() }
  pub fn on(&self, arg: &str) -> String { arg.to_string() }
  pub fn off(&self, arg: &str) -> String { arg.to_string() }
}
