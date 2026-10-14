CREATE TABLE `ai_calls` (
	`id` integer PRIMARY KEY,
	`user_id` text NOT NULL,
	`model` text NOT NULL,
	`attempt` integer NOT NULL,
	`success` integer NOT NULL,
	`error_class` text,
	`latency_ms` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "ai_calls_success" CHECK("success" in (0, 1))
);
--> statement-breakpoint
CREATE TABLE `dopamine` (
	`id` integer PRIMARY KEY,
	`user_id` text NOT NULL,
	`idea` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`last_used_at` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT "dopamine_is_default" CHECK("is_default" in (0, 1))
);
--> statement-breakpoint
CREATE TABLE `dump` (
	`id` integer PRIMARY KEY,
	`user_id` text NOT NULL,
	`text` text NOT NULL,
	`created_at` integer NOT NULL,
	`archived_at` integer
);
--> statement-breakpoint
CREATE TABLE `focus` (
	`id` integer PRIMARY KEY,
	`user_id` text NOT NULL,
	`label` text,
	`planned_minutes` integer,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	CONSTRAINT "focus_planned_minutes" CHECK("planned_minutes" is null or "planned_minutes" between 1 and 240),
	CONSTRAINT "focus_ended_after_started" CHECK("ended_at" is null or "ended_at" >= "started_at")
);
--> statement-breakpoint
CREATE TABLE `parked` (
	`id` integer PRIMARY KEY,
	`user_id` text NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `routines` (
	`id` integer PRIMARY KEY,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`time_of_day` text,
	`last_done_on` text,
	`created_at` integer NOT NULL,
	`archived_at` integer,
	CONSTRAINT "routines_time_of_day" CHECK("time_of_day" is null or "time_of_day" glob '[01][0-9]:[0-5][0-9]' or "time_of_day" glob '2[0-3]:[0-5][0-9]'),
	CONSTRAINT "routines_last_done_on" CHECK("last_done_on" is null or "last_done_on" glob '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]')
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY,
	`user_id` text NOT NULL,
	`parent_id` integer,
	`title` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`source` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	CONSTRAINT `fk_tasks_user_id_parent_id_tasks_user_id_id_fk` FOREIGN KEY (`user_id`,`parent_id`) REFERENCES `tasks`(`user_id`,`id`) ON DELETE CASCADE,
	CONSTRAINT `tasks_user_id_id_unique` UNIQUE(`user_id`,`id`),
	CONSTRAINT "tasks_status" CHECK("status" in ('open', 'done', 'archived')),
	CONSTRAINT "tasks_source" CHECK("source" is null or "source" in ('ai', 'fallback', 'mock')),
	CONSTRAINT "tasks_position" CHECK(("parent_id" is null and "position" = 0) or ("parent_id" is not null and "position" >= 1)),
	CONSTRAINT "tasks_source_on_parent_only" CHECK("parent_id" is null or "source" is null),
	CONSTRAINT "tasks_done_has_completed_at" CHECK(("status" = 'done') = ("completed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE `wins` (
	`id` integer PRIMARY KEY,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	`ref_id` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT "wins_kind" CHECK("kind" in ('step', 'task', 'focus', 'routine', 'manual'))
);
--> statement-breakpoint
CREATE INDEX `ai_calls_user_created` ON `ai_calls` (`user_id`,"created_at" desc);--> statement-breakpoint
CREATE INDEX `dopamine_user_used` ON `dopamine` (`user_id`,`last_used_at`);--> statement-breakpoint
CREATE INDEX `dump_user_created` ON `dump` (`user_id`,"created_at" desc);--> statement-breakpoint
CREATE UNIQUE INDEX `focus_one_open` ON `focus` (`user_id`) WHERE "focus"."ended_at" is null;--> statement-breakpoint
CREATE INDEX `parked_user_created` ON `parked` (`user_id`,"created_at" desc);--> statement-breakpoint
CREATE INDEX `routines_user` ON `routines` (`user_id`) WHERE "routines"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `tasks_user_parent_status` ON `tasks` (`user_id`,`parent_id`,`status`,`position`);--> statement-breakpoint
CREATE INDEX `tasks_user_active` ON `tasks` (`user_id`,`status`,"updated_at" desc) WHERE "tasks"."parent_id" is null;--> statement-breakpoint
CREATE INDEX `wins_user_created` ON `wins` (`user_id`,"created_at" desc);