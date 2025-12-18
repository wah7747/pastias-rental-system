// js/supabase.js
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";


const SUPABASE_URL = "https://zviofrgkbvncgvrhgbcx.supabase.co"; // ← your URL
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2aW9mcmdrYnZuY2d2cmhnYmN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM5MDQzNDUsImV4cCI6MjA3OTQ4MDM0NX0.OiPawjg8pQ2DXvORKPWO3tLbA1WlCW2OzyouU89nGFk";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
