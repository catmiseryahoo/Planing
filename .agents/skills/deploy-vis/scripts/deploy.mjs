import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load the local environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), 'frontend/.env') });

const url = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Error: VITE_SUPABASE_URL is missing in frontend/.env OR SUPABASE_SERVICE_ROLE_KEY is missing in .env.local");
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("Usage: node deploy.mjs <Visualization Name> <Path to HTML file>");
  process.exit(1);
}

const visName = args[0];
const htmlFilePath = args[1];

if (!fs.existsSync(htmlFilePath)) {
  console.error(`Error: File not found at ${htmlFilePath}`);
  process.exit(1);
}

const content = fs.readFileSync(htmlFilePath, 'utf8');

// Use service_role key to bypass RLS
const supabase = createClient(url, serviceKey);

async function deploy() {
  console.log("Connecting to Supabase as Service Role (Admin)...");

  // Automatically find the first available project ID
  const { data: projects, error: projError } = await supabase.from('projects').select('id, name').limit(1);
  
  if (projError || !projects || projects.length === 0) {
    console.error("Could not find any projects in the database!");
    process.exit(1);
  }

  const projectId = projects[0].id;
  const projectName = projects[0].name;

  console.log(`Found project: "${projectName}" (ID: ${projectId})`);
  // Check if visualization with the same name and project_id exists
  const { data: existing, error: findError } = await supabase
    .from('project_visualizations')
    .select('id')
    .eq('project_id', projectId)
    .eq('name', visName)
    .limit(1);

  if (findError) {
    console.error("Error searching for existing visualization:", findError.message);
    process.exit(1);
  }

  let data, error;
  if (existing && existing.length > 0) {
    console.log(`Found existing visualization with ID: ${existing[0].id}. Updating content...`);
    const res = await supabase
      .from('project_visualizations')
      .update({
        content: content,
        updated_at: new Date().toISOString()
      })
      .eq('id', existing[0].id)
      .select();
    data = res.data;
    error = res.error;
  } else {
    console.log("No existing visualization found. Inserting new row...");
    const res = await supabase
      .from('project_visualizations')
      .insert([{
        project_id: projectId,
        name: visName,
        content: content
      }])
      .select();
    data = res.data;
    error = res.error;
  }

  if (error) {
    console.error("Failed to deploy visualization:", error.message);
    process.exit(1);
  }

  console.log("Success! Visualization deployed.");
  console.log("ID:", data[0].id);
}

deploy();
