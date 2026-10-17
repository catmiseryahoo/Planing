-- Create missing indexes on foreign keys to optimize query performance and joins

-- stages table
CREATE INDEX IF NOT EXISTS stages_project_id_idx ON public.stages(project_id);

-- tasks table
CREATE INDEX IF NOT EXISTS tasks_stage_id_idx ON public.tasks(stage_id);

-- subtasks table
CREATE INDEX IF NOT EXISTS subtasks_task_id_idx ON public.subtasks(task_id);

-- comments table
CREATE INDEX IF NOT EXISTS comments_task_id_idx ON public.comments(task_id);
CREATE INDEX IF NOT EXISTS comments_author_id_idx ON public.comments(author_id);

-- task_files table
CREATE INDEX IF NOT EXISTS task_files_task_id_idx ON public.task_files(task_id);
CREATE INDEX IF NOT EXISTS task_files_uploader_id_idx ON public.task_files(uploader_id);

-- project_visualizations table
CREATE INDEX IF NOT EXISTS project_visualizations_project_id_idx ON public.project_visualizations(project_id);
CREATE INDEX IF NOT EXISTS project_visualizations_created_by_idx ON public.project_visualizations(created_by);

-- time_logs table
CREATE INDEX IF NOT EXISTS time_logs_task_id_idx ON public.time_logs(task_id);
CREATE INDEX IF NOT EXISTS time_logs_user_id_idx ON public.time_logs(user_id);

-- project_logs table
CREATE INDEX IF NOT EXISTS project_logs_actor_id_idx ON public.project_logs(actor_id);

-- site_messages table
CREATE INDEX IF NOT EXISTS site_messages_author_id_idx ON public.site_messages(author_id);

-- task_dependencies table
CREATE INDEX IF NOT EXISTS task_dependencies_task_id_idx ON public.task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS task_dependencies_depends_on_task_id_idx ON public.task_dependencies(depends_on_task_id);
