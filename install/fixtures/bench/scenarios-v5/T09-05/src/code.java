public class Worker {
  private boolean stopped;
  public void stop() { stopped = true; }
  public void run() { while (!stopped) doWork(); }
}