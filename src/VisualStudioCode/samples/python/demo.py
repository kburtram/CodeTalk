def say_hello(name: str):
    if name:
        print(f"Hello, {name}!")
    else:
        print(f"Hello world!")

print("What's your name?")
name = "Joe"
say_hello(name)