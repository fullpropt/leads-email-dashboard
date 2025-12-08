CREATE TABLE `email_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(255) NOT NULL,
	`assunto` varchar(500) NOT NULL,
	`html_content` text NOT NULL,
	`ativo` int NOT NULL DEFAULT 1,
	`criado_em` timestamp NOT NULL DEFAULT (now()),
	`atualizado_em` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `email_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `leads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` text NOT NULL,
	`email` varchar(320) NOT NULL,
	`produto` text,
	`plano` text,
	`valor` int NOT NULL DEFAULT 0,
	`data_aprovacao` timestamp,
	`data_criacao` timestamp NOT NULL DEFAULT (now()),
	`email_enviado` int NOT NULL DEFAULT 0,
	`data_envio_email` timestamp,
	CONSTRAINT `leads_id` PRIMARY KEY(`id`)
);
