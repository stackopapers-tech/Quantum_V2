# (c) Quantum Hub — proprietary hub build. All rights reserved.
import sqlite3
con = sqlite3.connect('hub_server.db')
con.row_factory = sqlite3.Row
print('Direct match:')
row = con.execute("SELECT * FROM users WHERE username = 'LoginTest2'").fetchone()
print(row)
print()
print('Lowercase match:')
row = con.execute("SELECT * FROM users WHERE username = ?", ('logintest2',)).fetchone()
print(row)