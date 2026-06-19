# This file defines Pydantic schemas used for validating data entering the system (requests)
# and data leaving the system (responses).
# They act as "gatekeepers" and ensure data consistency across the application.

from pydantic import BaseModel, EmailStr
from typing import Optional
from uuid import UUID
from datetime import datetime

# ─────────────────────────────────────────
# REQUEST SCHEMAS (What frontend sends)
# ─────────────────────────────────────────



# Used when the frontend calls POST /api/aws/connect to link a new AWS account.
# role_arn: Required. Must be a string.
# account_name: Optional. Defaults to None if the user doesn't provide a custom label.
class ConnectAwsRequest(BaseModel):
    role_arn: str           # arn:aws:iam::123456789012:role/GravityLensRole
    account_name: Optional[str] = None


# Used to define the shape of the object we expect when the frontend sends us user data (e.g. during signup).

class CreateUserRequest(BaseModel):
    email: str
    name: Optional[str] = None
    auth0_id: Optional[str] = None

# ─────────────────────────────────────────
# RESPONSE SCHEMAS (What backend returns)
# ─────────────────────────────────────────


# Represents a single AWS account stored in our database.
class AwsAccountResponse(BaseModel):
    id: UUID
    account_id: str
    account_name: Optional[str]
    role_arn: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True

class ConnectAwsResponse(BaseModel):
    success: bool
    message: str
    account: Optional[AwsAccountResponse] = None