#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "GameFramework/GameModeBase.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/Actor.h"
#include "ReserveRuntime.generated.h"

class UCameraComponent;
class UHierarchicalInstancedStaticMeshComponent;
class UStaticMesh;

UCLASS()
class WILDLIFERESERVE_API AReserveWalker : public ACharacter
{
    GENERATED_BODY()
public:
    AReserveWalker();
    virtual void SetupPlayerInputComponent(UInputComponent* Input) override;
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Reserve")
    TObjectPtr<UCameraComponent> ViewCamera;
private:
    void Forward(float Value);
    void Right(float Value);
    void Turn(float Value);
    void Look(float Value);
    void TurnRate(float Value);
    void LookRate(float Value);
    void Sprint();
    void Walk();
};

UCLASS()
class WILDLIFERESERVE_API AReserveController : public APlayerController
{
    GENERATED_BODY()
public:
    virtual void BeginPlay() override;
};

// Independent persistent-world mode. Does not inherit Frontline BR timers,
// bot spawning, winner logic, or level restart semantics.
UCLASS()
class WILDLIFERESERVE_API AReserveGameMode : public AGameModeBase
{
    GENERATED_BODY()
public:
    AReserveGameMode();
};

// Shared mesh placements, not wildlife identities. The import script creates
// groups per 32m cell, preserving source placements without one Actor per blade.
UCLASS()
class WILDLIFERESERVE_API AReserveInstanceGroup : public AActor
{
    GENERATED_BODY()
public:
    AReserveInstanceGroup();
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Reserve")
    TObjectPtr<UHierarchicalInstancedStaticMeshComponent> Instances;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Reserve") FString SourceAssetId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Reserve") FString SourceDistrictId;
    UFUNCTION(BlueprintCallable, Category="Reserve")
    void Configure(UStaticMesh* Mesh, bool bBlocksPlayer);
};
