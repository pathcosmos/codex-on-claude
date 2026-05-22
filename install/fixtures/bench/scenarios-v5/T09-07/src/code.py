import os
if os.path.exists('/tmp/data'):
    os.remove('/tmp/data')  # window between check and use