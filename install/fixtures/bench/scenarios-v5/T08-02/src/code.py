from datetime import datetime
d = datetime.now()
# Uses default locale, breaks across locales
print(d.strftime("%m/%d/%Y"))