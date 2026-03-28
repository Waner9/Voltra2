import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export default supabase;

// ── Auth ─────────────────────────────────────────────────────

export async function signUp(email, password, name) {
  return supabase.auth.signUp({
    email, password,
    options: { data: { name } },
  });
}

export async function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

// ── Programme ────────────────────────────────────────────────

// Appelle l'Edge Function sécurisée (clé Claude côté serveur)
export async function generateProgram({ sport, objectif, niveau, frequence }) {
  const session = await getSession();

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-program`,
    {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ sport, objectif, niveau, frequence }),
    }
  );

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Erreur génération");
  return data.programme;
}

// Récupérer le programme actif
export async function getProgrammeActif() {
  const { data, error } = await supabase
    .from("programmes")
    .select("*")
    .eq("statut", "actif")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) return null;
  return data;
}

// ── Séances ──────────────────────────────────────────────────

export async function getSeanceDuJour(programmeId) {
  const { data, error } = await supabase
    .from("seances")
    .select(`*, exercices(*)`)
    .eq("programme_id", programmeId)
    .eq("statut", "a_faire")
    .order("semaine", { ascending: true })
    .order("jour",    { ascending: true })
    .limit(1)
    .single();

  if (error) return null;
  // Trier les exercices par ordre
  if (data?.exercices) {
    data.exercices.sort((a, b) => a.ordre - b.ordre);
  }
  return data;
}

export async function getHistorique(userId) {
  const { data, error } = await supabase
    .from("seances")
    .select(`*, logs_performance(*)`)
    .eq("user_id", userId)
    .eq("statut", "faite")
    .order("date_realisee", { ascending: false })
    .limit(20);

  if (error) return [];
  return data;
}

// ── Validation séance ────────────────────────────────────────

export async function validateSession({ seanceId, logs, feedback }) {
  const session = await getSession();

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-session`,
    {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ seanceId, logs, feedback }),
    }
  );

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Erreur validation");
  return data; // { progression, messages, deload }
}

// ── Profil ───────────────────────────────────────────────────

export async function getProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return data;
}

export async function updateProfile(updates) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", user.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ── Progression ──────────────────────────────────────────────

export async function getProgressionExercice(exerciceNom) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Récupère les 8 derniers logs pour cet exercice (courbe de progression)
  const { data } = await supabase
    .from("logs_performance")
    .select("charge_kg, reps_par_set, logged_at")
    .eq("user_id", user.id)
    .order("logged_at", { ascending: true })
    .limit(8);

  return data || [];