import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://vuqwwimpmafdnqxdvdfu.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cXd3aW1wbWFmZG5xeGR2ZGZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3MzA0NzQsImV4cCI6MjA5MzMwNjQ3NH0.diU65el6mGGjBM27TFmNAW2AU8u63GXg4bXDKWmdN6g")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
