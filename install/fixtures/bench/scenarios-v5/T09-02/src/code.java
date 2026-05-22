public class Singleton {
  private static Singleton instance;
  public static Singleton get() {
    if (instance == null) {
      synchronized (Singleton.class) {
        if (instance == null) instance = new Singleton();
      }
    }
    return instance;
  }
}