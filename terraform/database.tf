resource "random_password" "db_password" {
  length  = 32
  special = false
}

resource "aws_db_subnet_group" "aurora" {
  name       = "${var.project_name}-db"
  subnet_ids = aws_subnet.private[*].id

  tags = {
    Name = "${var.project_name}-db-subnet-group"
  }
}

resource "aws_db_instance" "aurora" {
  identifier                 = "${var.project_name}-db"
  engine                     = "postgres"
  instance_class             = "db.t3.micro"
  allocated_storage          = 20
  max_allocated_storage      = 100
  db_name                    = var.db_name
  username                   = "postgres"
  password                   = random_password.db_password.result
  db_subnet_group_name       = aws_db_subnet_group.aurora.name
  vpc_security_group_ids     = [aws_security_group.aurora.id]
  publicly_accessible        = false
  storage_encrypted          = true
  skip_final_snapshot        = var.environment != "prod"
  final_snapshot_identifier  = var.environment == "prod" ? "${var.project_name}-db-final-snapshot-${formatdate("YYYY-MM-DD-hhmm", timestamp())}" : null
  backup_retention_period    = var.environment == "prod" ? 7 : 1
  backup_window              = "03:00-04:00"
  maintenance_window         = "sun:04:00-sun:05:00"
  deletion_protection        = var.environment == "prod"
  auto_minor_version_upgrade = true
  multi_az                   = false

  tags = {
    Name = "${var.project_name}-postgres"
  }

  lifecycle {
    ignore_changes = [final_snapshot_identifier]
  }
}
