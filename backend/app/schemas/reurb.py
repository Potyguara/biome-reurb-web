from pydantic import BaseModel


class ProjectDashboardResponse(BaseModel):
    project_id: str
    project_name: str

    total_lots: int
    total_seals: int
    total_social_registrations: int
    total_physical_registrations: int
    total_documents: int

    lots_without_seal: int
    seals_without_social: int
    seals_without_physical: int
    social_without_documents: int
    seals_needing_rtk: int


class LotResponse(BaseModel):
    id: str
    project_id: str
    code: str
    block: str | None = None
    area_m2: float | None = None
    perimeter_m: float | None = None
    status: str
    needs_review: bool
    source_file: str | None = None
    notes: str | None = None

    lot_review_status: str | None = None
    technical_status: str | None = None
    is_ready_for_technical_documents: bool | None = None
    geometry_geojson: dict | None = None
    centroid_latitude: float | None = None
    centroid_longitude: float | None = None
    geospatial_source: str | None = None
    geospatial_accuracy_m: float | None = None
    revision_notes: str | None = None

    class Config:
        from_attributes = True


class SealResponse(BaseModel):
    id: str
    project_id: str
    lot_id: str | None = None

    seal_code: str
    lot_code: str | None = None
    situation: str

    geo_link_status: str
    needs_rtk_validation: bool
    geospatial_note: str | None = None

    latitude: float | None = None
    longitude: float | None = None
    gps_accuracy: float | None = None

    responsible_name: str | None = None
    responsible_cpf: str | None = None
    phone: str | None = None
    property_type: str | None = None
    property_use: str | None = None
    social_count: int | None = None
    physical_count: int | None = None
    documents_count: int | None = None

    class Config:
        from_attributes = True


class SocialRegistrationResponse(BaseModel):
    id: str
    project_id: str
    seal_id: str | None = None
    seal_code: str

    responsible_name: str
    responsible_cpf: str | None = None
    responsible_rg: str | None = None
    issuing_agency: str | None = None
    phone: str | None = None

    marital_status: str | None = None
    profession: str | None = None
    household_members: int | None = None
    family_income: float | None = None

    receives_social_program: bool
    social_program: str | None = None

    occupation_years: int | None = None
    occupation_type: str | None = None
    possession_document: str | None = None

    owns_other_property: bool
    has_conflict: bool

    notes: str | None = None

    lot_id: str | None = None
    lot_code: str | None = None
    documents_count: int | None = None

    class Config:
        from_attributes = True


class PhysicalRegistrationResponse(BaseModel):
    id: str
    project_id: str
    seal_id: str | None = None
    seal_code: str

    property_type: str | None = None
    property_use: str | None = None

    wall_material: str | None = None
    roof_type: str | None = None
    floor_type: str | None = None

    floors: int | None = None
    rooms: int | None = None
    bathrooms: int | None = None

    has_energy: bool
    has_water: bool
    has_sewage: bool
    has_bathroom: bool

    habitability_condition: str | None = None

    risk_area: bool
    flood_prone: bool

    notes: str | None = None

    lot_id: str | None = None
    lot_code: str | None = None

    class Config:
        from_attributes = True


class DocumentResponse(BaseModel):
    id: str
    project_id: str
    lot_id: str | None = None
    seal_id: str | None = None
    social_registration_id: str | None = None

    seal_code: str
    document_type: str
    file_path: str

    original_filename: str | None = None
    stored_filename: str | None = None
    mime_type: str | None = None
    file_size_bytes: int | None = None

    notes: str | None = None
    validated: bool

    document_status: str | None = None
    validation_notes: str | None = None
    validated_at: str | None = None
    validated_by_user_id: str | None = None

    class Config:
        from_attributes = True


class ProjectMapSealResponse(BaseModel):
    id: str
    seal_code: str
    lot_code: str | None = None
    situation: str
    geo_link_status: str
    needs_rtk_validation: bool
    geospatial_note: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    gps_accuracy: float | None = None


class ProjectMapSocialResponse(BaseModel):
    id: str
    responsible_name: str
    responsible_cpf: str | None = None
    phone: str | None = None
    household_members: int | None = None
    family_income: float | None = None
    has_conflict: bool


class ProjectMapPhysicalResponse(BaseModel):
    id: str
    property_type: str | None = None
    property_use: str | None = None
    wall_material: str | None = None
    roof_type: str | None = None
    floor_type: str | None = None
    rooms: int | None = None
    bathrooms: int | None = None
    has_energy: bool
    has_water: bool
    has_sewage: bool
    has_bathroom: bool
    habitability_condition: str | None = None
    risk_area: bool
    flood_prone: bool


class ProjectMapLotResponse(BaseModel):
    id: str
    code: str
    block: str | None = None
    area_m2: float | None = None
    perimeter_m: float | None = None

    status: str
    needs_review: bool

    lot_review_status: str
    technical_status: str
    is_ready_for_technical_documents: bool
    geometry_geojson: dict | None = None

    centroid_latitude: float | None = None
    centroid_longitude: float | None = None
    geospatial_source: str | None = None
    geospatial_accuracy_m: float | None = None
    revision_notes: str | None = None

    seal: ProjectMapSealResponse | None = None
    social: ProjectMapSocialResponse | None = None
    physical: ProjectMapPhysicalResponse | None = None
    documents_count: int
    pending_flags: list[str]


class ProjectMapSealWithoutLotResponse(BaseModel):
    id: str
    seal_code: str
    lot_code: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    geo_link_status: str
    needs_rtk_validation: bool


class ProjectMapSummaryResponse(BaseModel):
    total_lots: int
    ready_lots: int
    pending_lots: int
    inconsistent_lots: int
    lots_without_geometry: int
    lots_without_seal: int
    seals_without_lot: int


class ProjectMapProjectResponse(BaseModel):
    id: str
    name: str
    municipality: str
    state: str
    neighborhood: str
    reurb_type: str
    status: str


class ProjectMapResponse(BaseModel):
    project: ProjectMapProjectResponse
    summary: ProjectMapSummaryResponse
    lots: list[ProjectMapLotResponse]
    seals_without_lot: list[ProjectMapSealWithoutLotResponse]


class LotReviewUpdate(BaseModel):
    lot_review_status: str
    technical_status: str | None = None
    revision_notes: str | None = None
    is_ready_for_technical_documents: bool | None = None


class LotReviewResponse(BaseModel):
    id: str
    project_id: str
    code: str
    lot_review_status: str
    technical_status: str
    is_ready_for_technical_documents: bool
    revision_notes: str | None = None


class LotDeleteCheckResponse(BaseModel):
    can_delete: bool
    lot_id: str
    lot_code: str
    links: dict
    message: str


class LotLinkCandidateResponse(BaseModel):
    seal_id: str
    seal_code: str
    lot_code: str | None = None
    responsible_name: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    geo_link_status: str
    distance_m: float | None = None
    has_social: bool
    has_physical: bool
    documents_count: int


class LotLinkSealRequest(BaseModel):
    seal_id: str


class LotLinkSealResponse(BaseModel):
    lot_id: str
    lot_code: str
    seal_id: str
    seal_code: str
    message: str


class LotDocumentResponse(BaseModel):
    id: str
    project_id: str
    lot_id: str | None = None
    seal_id: str | None = None
    social_registration_id: str | None = None

    seal_code: str
    document_type: str

    file_path: str
    original_filename: str | None = None
    stored_filename: str | None = None
    mime_type: str | None = None
    file_size_bytes: int | None = None

    notes: str | None = None

    validated: bool
    document_status: str
    validation_notes: str | None = None
    validated_at: str | None = None
    validated_by_user_id: str | None = None

    class Config:
        from_attributes = True


class DocumentValidationUpdate(BaseModel):
    document_status: str
    validation_notes: str | None = None


class LotDocumentUploadResponse(BaseModel):
    id: str
    lot_id: str
    document_type: str
    original_filename: str
    message: str


class DocumentValidateRequest(BaseModel):
    validated: bool


class SealUpdateRequest(BaseModel):
    seal_code: str | None = None
    lot_code: str | None = None
    situation: str | None = None

    geo_link_status: str | None = None
    needs_rtk_validation: bool | None = None
    geospatial_note: str | None = None

    latitude: float | None = None
    longitude: float | None = None
    gps_accuracy: float | None = None


class SocialRegistrationUpdateRequest(BaseModel):
    seal_code: str | None = None

    responsible_name: str | None = None
    responsible_cpf: str | None = None
    responsible_rg: str | None = None
    issuing_agency: str | None = None
    phone: str | None = None

    marital_status: str | None = None
    profession: str | None = None

    household_members: int | None = None
    family_income: float | None = None

    receives_social_program: bool | None = None
    social_program: str | None = None

    occupation_years: int | None = None
    occupation_type: str | None = None
    possession_document: str | None = None

    owns_other_property: bool | None = None
    has_conflict: bool | None = None

    notes: str | None = None


class PhysicalRegistrationUpdateRequest(BaseModel):
    seal_code: str | None = None

    property_type: str | None = None
    property_use: str | None = None

    wall_material: str | None = None
    roof_type: str | None = None
    floor_type: str | None = None

    floors: int | None = None
    rooms: int | None = None
    bathrooms: int | None = None

    has_energy: bool | None = None
    has_water: bool | None = None
    has_sewage: bool | None = None
    has_bathroom: bool | None = None

    habitability_condition: str | None = None

    risk_area: bool | None = None
    flood_prone: bool | None = None

    notes: str | None = None
