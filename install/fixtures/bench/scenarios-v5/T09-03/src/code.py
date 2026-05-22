def process(items):
    for item in items:
        if item.expired:
            items.remove(item)