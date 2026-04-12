import ccxt.pro as ccxt
import inspect

def main():
    ex = ccxt.kucoinfutures()
    print("create_order signature:")
    print(inspect.signature(ex.create_order))
    print("\ncreate_order source:")
    print(inspect.getsource(ex.create_order))

if __name__ == "__main__":
    main()
