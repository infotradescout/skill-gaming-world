#include "ReserveRuntime.h"
#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/HierarchicalInstancedStaticMeshComponent.h"
#include "Components/InputComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Modules/ModuleManager.h"
#include "Engine/World.h"

IMPLEMENT_PRIMARY_GAME_MODULE(FDefaultGameModuleImpl, WildlifeReserve, "WildlifeReserve");

AReserveWalker::AReserveWalker()
{
    GetCapsuleComponent()->InitCapsuleSize(34.f,92.f);
    BaseEyeHeight = 80.f;
    bUseControllerRotationYaw = true;
    GetCharacterMovement()->MaxWalkSpeed = 350.f;
    GetCharacterMovement()->MaxStepHeight = 40.f;
    GetCharacterMovement()->JumpZVelocity = 380.f;
    GetCharacterMovement()->GetNavAgentPropertiesRef().bCanCrouch = true;
    ViewCamera = CreateDefaultSubobject<UCameraComponent>(TEXT("FieldView"));
    ViewCamera->SetupAttachment(GetCapsuleComponent());
    ViewCamera->SetRelativeLocation(FVector(0,0,80));
    ViewCamera->bUsePawnControlRotation = true;
    ViewCamera->FieldOfView = 62.f;
}
void AReserveWalker::SetupPlayerInputComponent(UInputComponent* Input)
{
    Super::SetupPlayerInputComponent(Input);
    check(Input);
    Input->BindAxis(TEXT("MoveForward"),this,&AReserveWalker::Forward);
    Input->BindAxis(TEXT("MoveRight"),this,&AReserveWalker::Right);
    Input->BindAxis(TEXT("Turn"),this,&AReserveWalker::Turn);
    Input->BindAxis(TEXT("LookUp"),this,&AReserveWalker::Look);
    Input->BindAxis(TEXT("TurnRate"),this,&AReserveWalker::TurnRate);
    Input->BindAxis(TEXT("LookRate"),this,&AReserveWalker::LookRate);
    Input->BindAction(TEXT("Jump"),IE_Pressed,this,&ACharacter::Jump);
    Input->BindAction(TEXT("Jump"),IE_Released,this,&ACharacter::StopJumping);
    Input->BindAction(TEXT("Sprint"),IE_Pressed,this,&AReserveWalker::Sprint);
    Input->BindAction(TEXT("Sprint"),IE_Released,this,&AReserveWalker::Walk);
}
void AReserveWalker::Forward(float V)
{
    if(Controller) AddMovementInput(FRotationMatrix(FRotator(0,Controller->GetControlRotation().Yaw,0)).GetUnitAxis(EAxis::X),V);
}
void AReserveWalker::Right(float V)
{
    if(Controller) AddMovementInput(FRotationMatrix(FRotator(0,Controller->GetControlRotation().Yaw,0)).GetUnitAxis(EAxis::Y),V);
}
void AReserveWalker::Turn(float V){ AddControllerYawInput(V); }
void AReserveWalker::Look(float V){ AddControllerPitchInput(V); }
void AReserveWalker::TurnRate(float V){ AddControllerYawInput(V*75.f*GetWorld()->GetDeltaSeconds()); }
void AReserveWalker::LookRate(float V){ AddControllerPitchInput(V*75.f*GetWorld()->GetDeltaSeconds()); }
void AReserveWalker::Sprint(){ GetCharacterMovement()->MaxWalkSpeed = 550.f; }
void AReserveWalker::Walk(){ GetCharacterMovement()->MaxWalkSpeed = 350.f; }

void AReserveController::BeginPlay()
{
    Super::BeginPlay();
    if(!IsLocalController()) return;
    // Preserve Frontline's verified source-level intent: possess the intended
    // pawn and give the viewport movement/look focus, not a floating default pawn.
    // Adapted from FrontlineBRGameMode.cpp PostLogin at dab4aa319e1d.
    SetIgnoreMoveInput(false);
    SetIgnoreLookInput(false);
    bShowMouseCursor = false;
    FInputModeGameOnly Mode;
    Mode.SetConsumeCaptureMouseDown(false);
    SetInputMode(Mode);
}
AReserveGameMode::AReserveGameMode()
{
    DefaultPawnClass = AReserveWalker::StaticClass();
    PlayerControllerClass = AReserveController::StaticClass();
}
AReserveInstanceGroup::AReserveInstanceGroup()
{
    PrimaryActorTick.bCanEverTick = false;
    Instances = CreateDefaultSubobject<UHierarchicalInstancedStaticMeshComponent>(TEXT("Instances"));
    RootComponent = Instances;
    Instances->SetMobility(EComponentMobility::Static);
    Instances->SetCollisionEnabled(ECollisionEnabled::NoCollision);
}
void AReserveInstanceGroup::Configure(UStaticMesh* Mesh, bool bBlocksPlayer)
{
    Instances->SetStaticMesh(Mesh);
    Instances->SetCollisionProfileName(bBlocksPlayer ? TEXT("BlockAll") : TEXT("NoCollision"));
    Instances->SetCollisionEnabled(bBlocksPlayer ? ECollisionEnabled::QueryAndPhysics : ECollisionEnabled::NoCollision);
    Instances->SetCanEverAffectNavigation(bBlocksPlayer);
}
