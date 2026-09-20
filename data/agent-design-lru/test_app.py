import subprocess, sys
out = subprocess.check_output([sys.executable, "app.py"], text=True)
assert "hello-grz" in out
print("ok")
